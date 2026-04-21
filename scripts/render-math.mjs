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
// fontCache: 'none' inlines glyph paths per expression. Tried
// 'local' and it was a wash on this dataset — most rows have only
// 1–2 math expressions each, so the shared-<defs> overhead
// outweighs the savings. Stay with 'none' for simplicity and
// because the output is trivially self-contained — every <svg>
// can be extracted and moved without rewriting references.
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
 * Return the rendered HTML only when it actually differs from the
 * input — i.e. the input contained math that got typeset. If the
 * render is a pass-through (no math present), return null so the
 * column stays NULL in the DB and the read path falls back to raw.
 * This makes the backfill dramatically smaller: ~30–50% of rows
 * (reading-section questions) contain no math anywhere, and every
 * individual HTML field across the bank sees the same skew.
 */
function renderIfChanged(html, label) {
  if (html == null || html === '') return null;
  const out = safeRender(html, label);
  return out === html ? null : out;
}

/**
 * Render options jsonb. Each element gets content_html_rendered
 * populated only when the option's content actually contained math
 * that got typeset. If no option in the array changed, return null
 * so options_rendered stays NULL and the read path falls back to
 * the original options jsonb.
 */
function renderOptions(options, rowId) {
  if (!Array.isArray(options)) return null;
  let anyChanged = false;
  const mapped = options.map((opt, i) => {
    if (opt == null || typeof opt !== 'object') return opt;
    const rendered = opt.content_html
      ? renderIfChanged(opt.content_html, `${rowId} options[${i}]`)
      : null;
    if (rendered != null) anyChanged = true;
    return { ...opt, content_html_rendered: rendered };
  });
  return anyChanged ? mapped : null;
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
    stem_rendered: renderIfChanged(row.stem_html, `${row.id} stem`),
    stimulus_rendered: renderIfChanged(row.stimulus_html, `${row.id} stimulus`),
    rationale_rendered: renderIfChanged(row.rationale_html, `${row.id} rationale`),
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
    // On whole-row failure, emit the row with NULL rendered
    // columns so the read path falls back to raw. Hash is still
    // set so the orchestrator can tell the row was attempted.
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
