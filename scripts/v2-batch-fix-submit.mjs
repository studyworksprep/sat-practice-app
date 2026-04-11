#!/usr/bin/env node
// v2-batch-fix-submit.mjs
// ─────────────────────────────────────────────────────────────────────
// Asynchronously submit a large set of questions_v2 rows to Claude via
// the Anthropic Message Batches API for HTML cleanup. Writes a
// "pending" row to questions_v2_fix_suggestions for each submitted
// question so the collect script can later correlate results back.
//
// Usage:
//   node --env-file=.env.local scripts/v2-batch-fix-submit.mjs [options]
//
// Options:
//   --limit=N           Max rows to submit in this run (default: all eligible)
//   --dry-run           Print plan without submitting
//   --include-clean     Don't skip rows that pass the isAlreadyClean filter
//   --only-unapproved   Restrict to rows with approved_at IS NULL (default)
//   --all               Include approved rows too (overrides --only-unapproved)
//
// Required env vars:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ANTHROPIC_API_KEY
//
// Pricing note:
//   The Batches API charges 50% of normal per-token rates and returns
//   results within 24h (usually much sooner). For 5000 questions this
//   is typically well under $10 with Haiku routing for simple rows.
// ─────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { pickModel, isAlreadyClean } from '../lib/questionsV2Hygiene.js';
import {
  SYSTEM_PROMPT,
  RETURN_FIXED_QUESTION_TOOL,
} from '../lib/questionsV2FixPrompt.js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  console.error('Tip: run with `node --env-file=.env.local scripts/v2-batch-fix-submit.mjs`.');
  process.exit(1);
}
if (!ANTHROPIC_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in env.');
  process.exit(1);
}

// ─── CLI args ───────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v === undefined ? true : v];
    }
    return [a, true];
  })
);

const LIMIT = args.limit ? Number(args.limit) : null;
const DRY_RUN = !!args['dry-run'];
const INCLUDE_CLEAN = !!args['include-clean'];
const ALL = !!args.all;

// Anthropic's documented Batches API cap is 100,000 requests per batch.
// Stay well under that for ergonomics and because a failed batch of
// 100k is painful to retry.
const MAX_BATCH_SIZE = 5000;

// ─── Supabase admin client ──────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Load candidates ────────────────────────────────────────────────
console.log('→ Loading candidate rows from questions_v2…');

let query = supabase
  .from('questions_v2')
  .select('id, question_type, stimulus_html, stem_html, options, display_code, approved_at')
  .order('created_at', { ascending: true });

if (!ALL) query = query.is('approved_at', null);

const { data: rows, error: loadErr } = await query;
if (loadErr) {
  console.error('Failed to load questions_v2:', loadErr.message);
  process.exit(1);
}
console.log(`  loaded ${rows.length} row(s) before filtering`);

// ─── Filter out rows that already have a pending suggestion ────────
console.log('→ Excluding rows with an existing pending suggestion…');
const { data: pending, error: penErr } = await supabase
  .from('questions_v2_fix_suggestions')
  .select('question_id')
  .eq('status', 'pending');
if (penErr) {
  console.error('Failed to query questions_v2_fix_suggestions:', penErr.message);
  process.exit(1);
}
const pendingSet = new Set((pending || []).map((r) => r.question_id));

// ─── Filter out clean rows unless --include-clean ──────────────────
let candidates = rows.filter((r) => !pendingSet.has(r.id));
const beforeClean = candidates.length;
if (!INCLUDE_CLEAN) {
  candidates = candidates.filter((r) => !isAlreadyClean(r));
}
const afterClean = candidates.length;
console.log(`  after pending filter: ${beforeClean}`);
console.log(`  after clean filter:   ${afterClean}  (dropped ${beforeClean - afterClean} clean rows)`);

if (LIMIT && candidates.length > LIMIT) {
  candidates = candidates.slice(0, LIMIT);
  console.log(`  capped to --limit=${LIMIT}`);
}
if (candidates.length > MAX_BATCH_SIZE) {
  console.log(`  capping to MAX_BATCH_SIZE=${MAX_BATCH_SIZE}`);
  candidates = candidates.slice(0, MAX_BATCH_SIZE);
}

if (candidates.length === 0) {
  console.log('Nothing to submit. Exiting.');
  process.exit(0);
}

// ─── Build batch requests ──────────────────────────────────────────
console.log(`→ Building ${candidates.length} batch request(s)…`);

function buildRequest(row) {
  const options = Array.isArray(row.options)
    ? row.options
        .slice()
        .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .map((o) => ({ label: o.label, content_html: o.content_html || '' }))
    : [];

  const userPayload = {
    question_type: row.question_type,
    stimulus_html: row.stimulus_html || null,
    stem_html: row.stem_html || '',
    options,
  };

  return {
    // custom_id must be <= 64 chars and unique within the batch. A
    // bare uuid is 36 chars, fits cleanly. We'll use it to look up
    // the source row when results come back.
    custom_id: row.id,
    params: {
      model: pickModel(row),
      max_tokens: 4000,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [RETURN_FIXED_QUESTION_TOOL],
      tool_choice: { type: 'tool', name: 'return_fixed_question' },
      messages: [{ role: 'user', content: JSON.stringify(userPayload) }],
    },
  };
}

const requests = candidates.map(buildRequest);

// Report the model split so the admin knows roughly what to expect cost-wise
const modelCounts = requests.reduce((acc, r) => {
  acc[r.params.model] = (acc[r.params.model] || 0) + 1;
  return acc;
}, {});
console.log('  model routing:', modelCounts);

if (DRY_RUN) {
  console.log('\n[dry-run] Not submitting. Sample request for first candidate:');
  console.log(JSON.stringify({ ...requests[0], params: { ...requests[0].params, system: '<SYSTEM_PROMPT>' } }, null, 2));
  process.exit(0);
}

// ─── Submit to Anthropic Batches API ──────────────────────────────
console.log('→ Submitting batch to Anthropic…');
const submitRes = await fetch('https://api.anthropic.com/v1/messages/batches', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({ requests }),
});

if (!submitRes.ok) {
  const errText = await submitRes.text();
  console.error(`Anthropic API error (${submitRes.status}): ${errText}`);
  process.exit(1);
}

const batch = await submitRes.json();
console.log('✓ Batch submitted.');
console.log(`  batch id:          ${batch.id}`);
console.log(`  processing_status: ${batch.processing_status}`);
console.log(`  created_at:        ${batch.created_at}`);
console.log(`  expires_at:        ${batch.expires_at}`);

// ─── Write pending rows to questions_v2_fix_suggestions ───────────
console.log('→ Writing pending suggestion rows to the staging table…');

const pendingInserts = candidates.map((row) => {
  const opts = Array.isArray(row.options)
    ? row.options
        .slice()
        .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
        .map((o) => ({
          label: o.label,
          ordinal: o.ordinal ?? 0,
          content_html: o.content_html || '',
        }))
    : [];

  return {
    question_id: row.id,
    batch_id: batch.id,
    custom_id: row.id,
    status: 'pending',
    model: pickModel(row),
    source_stimulus_html: row.stimulus_html || null,
    source_stem_html: row.stem_html || '',
    source_options: opts,
  };
});

// Insert in chunks of 500 to stay under Supabase's payload limits.
const CHUNK = 500;
for (let i = 0; i < pendingInserts.length; i += CHUNK) {
  const slice = pendingInserts.slice(i, i + CHUNK);
  const { error } = await supabase
    .from('questions_v2_fix_suggestions')
    .insert(slice);
  if (error) {
    console.error(`Failed to insert pending rows [${i}..${i + slice.length}]:`, error.message);
    console.error(`Batch ${batch.id} is already live on Anthropic; you can still collect it with:`);
    console.error(`  node --env-file=.env.local scripts/v2-batch-fix-collect.mjs --batch-id=${batch.id}`);
    process.exit(1);
  }
  console.log(`  inserted ${Math.min(i + CHUNK, pendingInserts.length)}/${pendingInserts.length}`);
}

console.log(`\nDone. To collect results once Anthropic finishes processing, run:`);
console.log(`  node --env-file=.env.local scripts/v2-batch-fix-collect.mjs --batch-id=${batch.id}`);
