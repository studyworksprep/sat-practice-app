#!/usr/bin/env node
// Pre-render the math inside a batch of questions_v2 rows.
//
// Usage (stdin → stdout):
//   cat rows.json | node scripts/render-math.mjs > rendered.json
//
// Input  — JSON array of
//   { id, stem_html, stimulus_html, rationale_html, options }
//   where options is null | array of { label, ordinal, content_html }.
//
// Output — JSON array of
//   { id, stem_rendered, stimulus_rendered, rationale_rendered,
//     options_rendered, rendered_source_hash }
//
// Rendering logic lives in lib/content/render-math.mjs — this file
// is only the stdin/stdout adapter. The admin draft-preview Server
// Action imports the same module for live preview of proposed
// content changes.
//
// Orchestration (DB reads / writes) happens outside this script:
// for the backfill, the orchestrator pulls rows via Supabase MCP
// and pipes them through; for the GitHub Action that will host
// this long-term, a thin wrapper connects to Postgres directly.

import { renderRow, sourceHash } from '../lib/content/render-math.mjs';

function logRenderError(label, err) {
  process.stderr.write(`[render-math] ${label} failed: ${err.message}\n`);
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const raw = await readStdin();
const rows = JSON.parse(raw);
if (!Array.isArray(rows)) {
  process.stderr.write('[render-math] expected JSON array on stdin\n');
  process.exit(1);
}

const out = rows.map((row, i) => {
  try {
    return renderRow(row, logRenderError);
  } catch (err) {
    process.stderr.write(`[render-math] row ${i} (${row?.id}) failed: ${err.message}\n`);
    // On whole-row failure, emit NULL rendered columns so the
    // read path falls back to raw. Hash still set so the
    // orchestrator knows the row was attempted.
    return {
      id: row?.id,
      stem_rendered: null,
      stimulus_rendered: null,
      rationale_rendered: null,
      options_rendered: null,
      rendered_source_hash: sourceHash(row ?? {}),
    };
  }
});

process.stdout.write(JSON.stringify(out));
