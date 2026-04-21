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
// Math handled: `<math>…</math>` (Presentation MathML, the dominant
// format in College Board items) and `\(…\)` / `\[…\]` TeX
// delimiters. Output is inline SVG with glyph paths embedded per
// expression (`fontCache: 'none'`) so each rendered HTML blob is
// self-contained — no client-side stylesheet or font dependency.
//
// Non-math content (text, `<p>`, `<figure>`, pre-existing `<svg>`
// figures, `<img>`) passes through untouched.
//
// On render failure the source HTML is kept verbatim so the read
// path stays consistent; the error is written to stderr.
//
// Orchestration (DB reads / writes) happens outside this script:
// for the backfill, the orchestrator pulls rows via Supabase MCP
// and pipes them through; for the GitHub Action that will host
// this long-term, a thin wrapper connects to Postgres directly.

import { createHash } from 'node:crypto';
// Preload the full HTML-entity decoding table. MathJax otherwise
// async-loads per-letter tables (mathjax-full/js/util/entities/<c>.js)
// on first entity encountered; with the sync liteAdaptor + sync
// doc.render() path we use here, those async loads resolve too
// late and the handler state degrades. Importing 'all' forces
// every entity table to be available up front, which keeps render
// fully synchronous and keeps the handler healthy across
// consecutive documents. Cost is ~100KB of tables in memory —
// negligible for a CLI renderer.
import 'mathjax-full/js/util/entities/all.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { MathML } from 'mathjax-full/js/input/mathml.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

// ──────────────────────────────────────────────────────────────
// MathJax setup. One adaptor + handler for the whole process.
// Two input jaxes (TeX, MathML) share the same SVG output.
// ──────────────────────────────────────────────────────────────

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: AllPackages,
  inlineMath: [['\\(', '\\)']],
  displayMath: [['\\[', '\\]']],
});
const mml = new MathML();
const svg = new SVG({ fontCache: 'none' });

/**
 * Render all math (TeX delimiters + MathML) inside an HTML blob.
 * Returns the HTML with every math node replaced by inline SVG.
 *
 * Single document with both input jaxes — MathJax's findMath() runs
 * each input jax against the DOM and unions the matches, so both
 * TeX delimiters and <math> elements are caught in one pass without
 * needing to re-parse the intermediate HTML.
 */
function renderHtml(html) {
  if (html == null || html === '') return html;
  const doc = mathjax.document(html, {
    InputJax: [tex, mml],
    OutputJax: svg,
  });
  doc.render();
  return adaptor.innerHTML(adaptor.body(doc.document));
}

/** Same as renderHtml but swallows + logs errors, falls back to input. */
function safeRender(html, label) {
  try {
    return renderHtml(html);
  } catch (err) {
    process.stderr.write(`[render-math] ${label} failed: ${err.message}\n`);
    return html;
  }
}

/**
 * Render options jsonb. Each element gets content_html_rendered
 * added alongside the original fields. Shape is preserved so that
 * callers can key on label/ordinal without re-reading options.
 */
function renderOptions(options, rowId) {
  if (!Array.isArray(options)) return options;
  return options.map((opt, i) => {
    if (opt == null || typeof opt !== 'object') return opt;
    const rendered = opt.content_html
      ? safeRender(opt.content_html, `${rowId} options[${i}]`)
      : opt.content_html ?? null;
    return { ...opt, content_html_rendered: rendered };
  });
}

/** md5 over the source fields, so the orchestrator can detect stale rows. */
function sourceHash({ stem_html, stimulus_html, rationale_html, options }) {
  const h = createHash('md5');
  h.update(stem_html ?? '');
  h.update('\0');
  h.update(stimulus_html ?? '');
  h.update('\0');
  h.update(rationale_html ?? '');
  h.update('\0');
  h.update(options == null ? '' : JSON.stringify(options));
  return h.digest('hex');
}

function renderRow(row) {
  return {
    id: row.id,
    stem_rendered: safeRender(row.stem_html, `${row.id} stem`),
    stimulus_rendered: safeRender(row.stimulus_html, `${row.id} stimulus`),
    rationale_rendered: safeRender(row.rationale_html, `${row.id} rationale`),
    options_rendered: renderOptions(row.options, row.id),
    rendered_source_hash: sourceHash(row),
  };
}

// ──────────────────────────────────────────────────────────────
// CLI: stdin → stdout.
// ──────────────────────────────────────────────────────────────

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
    return renderRow(row);
  } catch (err) {
    process.stderr.write(`[render-math] row ${i} (${row?.id}) failed: ${err.message}\n`);
    return {
      id: row?.id,
      stem_rendered: row?.stem_html ?? null,
      stimulus_rendered: row?.stimulus_html ?? null,
      rationale_rendered: row?.rationale_html ?? null,
      options_rendered: row?.options ?? null,
      rendered_source_hash: sourceHash(row ?? {}),
    };
  }
});

process.stdout.write(JSON.stringify(out));
