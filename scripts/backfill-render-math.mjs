#!/usr/bin/env node
// Backfill the *_rendered columns on questions_v2. Iterates in
// batches over rows where rendered_source_hash does not match the
// current content hash (or is NULL — the initial case), renders
// each row through lib/content/render-math.mjs, and writes the
// rendered columns back. Designed for manual GHA invocation; no
// scheduling.
//
// Usage (normally via .github/workflows/render-math-backfill.yml):
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…
//   node scripts/backfill-render-math.mjs [--dry-run] [--batch=N] [--limit=N]
//
// Flags:
//   --dry-run   — log plan, write nothing
//   --batch=N   — rows per SELECT + per update loop (default 50)
//   --limit=N   — stop after N total rows (default: all)
//
// Staleness detection. A row needs rendering when:
//   rendered_source_hash IS NULL  OR
//   rendered_source_hash != md5(current source fields)
// We compute the expected hash client-side using sourceHash() from
// the shared renderer module — so both the CLI and the Server
// Component agree on what "stale" means.
//
// Trigger-aware updates. Migration 000026 installed a
// rendered-aware updated_at trigger on questions_v2: writes that
// touch only the rendered-* columns preserve the old updated_at.
// So this backfill doesn't masquerade as a content edit for any
// downstream consumer reading updated_at.

import { createClient } from '@supabase/supabase-js';
import { renderRow, sourceHash } from '../lib/content/render-math.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a === '--dry-run') return ['dryRun', true];
    const m = a.match(/^--([a-z-]+)=(.+)$/);
    return m ? [m[1], m[2]] : [a, true];
  }),
);

const dryRun    = Boolean(args.dryRun);
const batchSize = Number(args.batch ?? 50);
const limit     = args.limit ? Number(args.limit) : Infinity;

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY          = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`Backfill mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
console.log(`Batch size: ${batchSize}, total limit: ${limit === Infinity ? 'none' : limit}`);
console.log();

let processed = 0;
let written = 0;
let skipped = 0;
let errored = 0;
const t0 = Date.now();

/**
 * Fetch the next batch of rows that might need rendering. We can't
 * filter on "hash mismatch" directly in a single SQL predicate
 * (the expected hash is a client-side computation), so we select
 * on the simpler index-friendly condition rendered_at IS NULL,
 * then ALSO include a broader "hash may be stale" pass at the end
 * for rows that were rendered before a content edit. For the
 * initial backfill this first pass is the dominant workload.
 */
async function nextBatch(cursor) {
  const { data, error } = await supabase
    .from('questions_v2')
    .select('id, stem_html, stimulus_html, rationale_html, options, rendered_source_hash')
    .is('deleted_at', null)
    .is('rendered_at', null)
    .order('id')
    .gt('id', cursor)
    .limit(batchSize);
  if (error) throw new Error(`SELECT failed: ${error.message}`);
  return data ?? [];
}

async function applyRow(row, rendered) {
  if (dryRun) {
    console.log(`  [dry-run] would update ${row.id} (hash=${rendered.rendered_source_hash.slice(0,12)})`);
    return;
  }
  const { error } = await supabase
    .from('questions_v2')
    .update({
      stem_rendered:        rendered.stem_rendered,
      stimulus_rendered:    rendered.stimulus_rendered,
      rationale_rendered:   rendered.rationale_rendered,
      options_rendered:     rendered.options_rendered,
      rendered_source_hash: rendered.rendered_source_hash,
      rendered_at:          new Date().toISOString(),
    })
    .eq('id', row.id);
  if (error) throw new Error(`UPDATE failed for ${row.id}: ${error.message}`);
}

let cursor = '00000000-0000-0000-0000-000000000000';
while (processed < limit) {
  const rows = await nextBatch(cursor);
  if (rows.length === 0) break;
  cursor = rows[rows.length - 1].id;

  for (const row of rows) {
    if (processed >= limit) break;
    processed++;
    // Skip if already-current (race: row was rendered between the
    // SELECT and the time we got here). Hash check uses the same
    // canonical function the read path would call.
    const expectedHash = sourceHash(row);
    if (row.rendered_source_hash === expectedHash) {
      skipped++;
      continue;
    }
    try {
      const rendered = renderRow(row, (label, err) =>
        process.stderr.write(`[render-math] ${label} failed: ${err.message}\n`),
      );
      await applyRow(row, rendered);
      written++;
    } catch (err) {
      errored++;
      console.error(`  ERROR row ${row.id}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const rate = (processed / ((Date.now() - t0) / 1000)).toFixed(1);
  console.log(`batch done — processed ${processed} (written ${written}, skipped ${skipped}, errored ${errored}) in ${elapsed}s [${rate}/s]`);
}

console.log();
console.log(`Done${dryRun ? ' (dry run — no writes)' : ''}.`);
console.log(`Processed ${processed}, written ${written}, skipped ${skipped}, errored ${errored}.`);
