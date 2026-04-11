#!/usr/bin/env node
// v2-batch-fix-collect.mjs
// ─────────────────────────────────────────────────────────────────────
// Companion to v2-batch-fix-submit.mjs. Polls an Anthropic Message
// Batches job, downloads results when ready, parses each per-request
// tool_use payload, classifies the diff, and updates the corresponding
// row in questions_v2_fix_suggestions.
//
// This script NEVER touches questions_v2 directly — it only writes to
// the staging table. An admin later opens the Bulk Review panel and
// chooses which suggestions to apply.
//
// Usage:
//   node --env-file=.env.local scripts/v2-batch-fix-collect.mjs --batch-id=msgbatch_abc123
//   node --env-file=.env.local scripts/v2-batch-fix-collect.mjs --all-pending
//
// Options:
//   --batch-id=<id>     Specific Anthropic batch id to collect (from submit output)
//   --all-pending       Collect every batch id currently referenced by
//                       pending suggestion rows
//   --wait              Poll until the batch is done (default: fail if not ready)
//   --poll-interval=N   Seconds between polls when --wait is set (default: 30)
// ─────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  console.error('Tip: run with `node --env-file=.env.local scripts/v2-batch-fix-collect.mjs`.');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in env.');
  process.exit(1);
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v === undefined ? true : v];
    }
    return [a, true];
  })
);

const BATCH_ID = args['batch-id'] || null;
const ALL_PENDING = !!args['all-pending'];
const WAIT = !!args.wait;
const POLL_INTERVAL = args['poll-interval'] ? Number(args['poll-interval']) : 30;

if (!BATCH_ID && !ALL_PENDING) {
  console.error('Pass --batch-id=<id> or --all-pending.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function listBatchIds() {
  if (BATCH_ID) return [BATCH_ID];
  const { data, error } = await supabase
    .from('questions_v2_fix_suggestions')
    .select('batch_id')
    .eq('status', 'pending')
    .not('batch_id', 'is', null);
  if (error) throw new Error(error.message);
  return Array.from(new Set((data || []).map((r) => r.batch_id).filter(Boolean)));
}

async function fetchBatch(id) {
  const res = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, {
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic batch fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function fetchBatchResults(batch) {
  // results_url is a JSONL stream; Anthropic returns it once the batch
  // has ended. Some SDK examples show streaming via SSE — here we pull
  // the whole body (the batch size is bounded by MAX_BATCH_SIZE from
  // the submit script) and split by newline.
  const res = await fetch(batch.results_url, {
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic results fetch failed (${res.status}): ${text}`);
  }
  const body = await res.text();
  return body
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

// Normalize options so order + shape are stable between source and
// suggestion. Used for diff classification.
function normalizeOptions(opts) {
  if (!Array.isArray(opts)) return [];
  return opts
    .slice()
    .sort((a, b) => {
      // Prefer ordinal, fall back to label order (A/B/C/D/…)
      const oa = a.ordinal ?? 0;
      const ob = b.ordinal ?? 0;
      if (oa !== ob) return oa - ob;
      return String(a.label || '').localeCompare(String(b.label || ''));
    })
    .map((o) => ({
      label: String(o.label || ''),
      content_html: String(o.content_html || ''),
    }));
}

// Strip HTML tags + decode common entities + normalize whitespace so
// two strings can be compared on "visible text" alone, independent of
// markup and formatting.
function reduce(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:rsquo|lsquo);/g, "'")
    .replace(/&(?:ldquo|rdquo);/g, '"')
    .replace(/&(?:mdash|ndash);/g, '-')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&deg;/g, '°')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Maximum fraction of the source's visible text that a suggestion is
// allowed to drop before we flag it as a content-drop error. Set
// deliberately tight because Claude's cleanup should only ever be
// dropping HTML markup, not text the user would actually see.
const MAX_CONTENT_DROP_RATIO = 0.15;

// Classify the diff between source and suggestion. Four buckets:
//   - identical:   the suggestion is bit-for-bit the source
//   - trivial:     only whitespace / entity / class-attribute changes
//   - non_trivial: structural rewrites, math changes, etc.
//   - error:       the suggestion dropped too much visible text OR
//                  shows a different option count than the source
// Returns { classification, errorMessage } — errorMessage is non-null
// only for the 'error' bucket so the admin can see why it was flagged.
function classifyDiff(source, suggestion) {
  const srcStem = (source.stem_html || '').trim();
  const sugStem = (suggestion.stem_html || '').trim();
  const srcStim = (source.stimulus_html || '').trim();
  const sugStim = (suggestion.stimulus_html || '').trim();
  const srcOpts = normalizeOptions(source.options || []);
  const sugOpts = normalizeOptions(suggestion.options || []);

  // Option-count mismatch is always an error: Claude dropped or
  // invented an answer choice.
  if (srcOpts.length !== sugOpts.length && srcOpts.length > 0) {
    return {
      classification: 'error',
      errorMessage: `Option count changed from ${srcOpts.length} to ${sugOpts.length}`,
    };
  }

  // Content-drop check. Compare the TOTAL visible text on each side;
  // if the suggestion's visible text is more than MAX_CONTENT_DROP_RATIO
  // shorter than the source's, something got dropped. This catches
  // table captions, data rows, paragraph chunks, etc. that the model
  // silently deleted — the kind of bug that would otherwise land as
  // an innocent-looking "non_trivial" row.
  const srcText =
    reduce(srcStem) + ' ' + reduce(srcStim) + ' ' + srcOpts.map((o) => reduce(o.content_html)).join(' ');
  const sugText =
    reduce(sugStem) + ' ' + reduce(sugStim) + ' ' + sugOpts.map((o) => reduce(o.content_html)).join(' ');

  if (srcText.length > 0) {
    const dropRatio = 1 - sugText.length / srcText.length;
    if (dropRatio > MAX_CONTENT_DROP_RATIO) {
      return {
        classification: 'error',
        errorMessage: `Suggestion dropped ${Math.round(dropRatio * 100)}% of visible text (${srcText.length}→${sugText.length} chars)`,
      };
    }
  }

  if (
    srcStem === sugStem &&
    srcStim === sugStim &&
    JSON.stringify(srcOpts) === JSON.stringify(sugOpts)
  ) {
    return { classification: 'identical', errorMessage: null };
  }

  // "Trivial" means the reduced (tag-stripped, entity-decoded,
  // whitespace-collapsed, lowercased) shapes are identical — only
  // cosmetic changes.
  const srcShape = reduce(srcStem) + '|' + reduce(srcStim);
  const sugShape = reduce(sugStem) + '|' + reduce(sugStim);
  const srcOptShape = srcOpts.map((o) => reduce(o.content_html)).join('|');
  const sugOptShape = sugOpts.map((o) => reduce(o.content_html)).join('|');

  if (srcShape === sugShape && srcOptShape === sugOptShape) {
    return { classification: 'trivial', errorMessage: null };
  }

  return { classification: 'non_trivial', errorMessage: null };
}

async function collect(batchId) {
  console.log(`→ Fetching batch ${batchId}…`);
  let batch = await fetchBatch(batchId);
  console.log(`  processing_status: ${batch.processing_status}`);

  if (batch.processing_status !== 'ended') {
    if (!WAIT) {
      console.log(`  not ready yet. Re-run with --wait to poll, or try again later.`);
      return;
    }
    while (batch.processing_status !== 'ended') {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL * 1000));
      batch = await fetchBatch(batchId);
      console.log(`  still ${batch.processing_status} (request_counts: ${JSON.stringify(batch.request_counts)})`);
    }
  }

  if (!batch.results_url) {
    console.error(`  batch ended but results_url is missing. Full payload:`);
    console.error(JSON.stringify(batch, null, 2));
    return;
  }

  console.log(`→ Downloading results…`);
  const results = await fetchBatchResults(batch);
  console.log(`  ${results.length} result line(s)`);

  // Load the pending rows for this batch so we can match custom_id →
  // question_id + source snapshot.
  const { data: pendingRows, error: loadErr } = await supabase
    .from('questions_v2_fix_suggestions')
    .select('id, question_id, custom_id, source_stimulus_html, source_stem_html, source_options, status')
    .eq('batch_id', batchId);
  if (loadErr) {
    console.error(`  failed to load pending suggestions: ${loadErr.message}`);
    return;
  }
  const byCustom = new Map(pendingRows.map((r) => [r.custom_id, r]));

  let counts = { collected: 0, failed: 0, trivial: 0, non_trivial: 0, identical: 0, missing: 0 };

  for (const line of results) {
    const custom = line.custom_id;
    const row = byCustom.get(custom);
    if (!row) {
      counts.missing++;
      continue;
    }

    const result = line.result || {};
    if (result.type !== 'succeeded') {
      const errMsg =
        result.type === 'errored' && result.error?.error?.message
          ? result.error.error.message
          : JSON.stringify(result);
      await supabase
        .from('questions_v2_fix_suggestions')
        .update({
          status: 'failed',
          diff_classification: 'error',
          error_message: errMsg.slice(0, 2000),
          collected_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      counts.failed++;
      continue;
    }

    const message = result.message || {};
    const toolUse = (message.content || []).find(
      (c) => c.type === 'tool_use' && c.name === 'return_fixed_question'
    );
    if (!toolUse) {
      await supabase
        .from('questions_v2_fix_suggestions')
        .update({
          status: 'failed',
          diff_classification: 'error',
          error_message: 'Claude did not call return_fixed_question',
          collected_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      counts.failed++;
      continue;
    }

    const parsed = toolUse.input || {};
    const suggestion = {
      stimulus_html:
        typeof parsed.stimulus_html === 'string' || parsed.stimulus_html === null
          ? parsed.stimulus_html
          : row.source_stimulus_html,
      stem_html:
        typeof parsed.stem_html === 'string' ? parsed.stem_html : row.source_stem_html,
      options: Array.isArray(parsed.options)
        ? parsed.options.map((o, i) => ({
            label: o?.label ?? String.fromCharCode(65 + i),
            content_html: typeof o?.content_html === 'string' ? o.content_html : '',
          }))
        : [],
    };

    const source = {
      stimulus_html: row.source_stimulus_html,
      stem_html: row.source_stem_html,
      options: row.source_options,
    };

    const { classification, errorMessage } = classifyDiff(source, suggestion);

    // Suggestions that fail our sanity checks (content dropped, option
    // count changed) land as 'failed' with the reason in error_message,
    // NOT as 'collected' + non_trivial. This keeps the Bulk Review UI
    // from ever surfacing a broken suggestion as if it were reviewable.
    const isErr = classification === 'error';

    await supabase
      .from('questions_v2_fix_suggestions')
      .update({
        status: isErr ? 'failed' : 'collected',
        diff_classification: classification,
        error_message: errorMessage,
        suggested_stimulus_html: suggestion.stimulus_html,
        suggested_stem_html: suggestion.stem_html,
        suggested_options: suggestion.options,
        collected_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (isErr) {
      counts.failed++;
    } else {
      counts.collected++;
    }
    counts[classification] = (counts[classification] || 0) + 1;
  }

  console.log(`\n✓ Batch ${batchId} collected.`);
  console.log(`  collected:   ${counts.collected}`);
  console.log(`  failed:      ${counts.failed}`);
  console.log(`  identical:   ${counts.identical || 0}`);
  console.log(`  trivial:     ${counts.trivial || 0}`);
  console.log(`  non_trivial: ${counts.non_trivial || 0}`);
  console.log(`  error:       ${counts.error || 0}  (sanity-check failures — dropped content or option-count mismatch)`);
  if (counts.missing > 0) {
    console.log(`  missing:     ${counts.missing}  (results without a matching pending row — probably submitted before this script was run)`);
  }
}

const batchIds = await listBatchIds();
if (batchIds.length === 0) {
  console.log('No batches to collect.');
  process.exit(0);
}

for (const id of batchIds) {
  await collect(id);
}
