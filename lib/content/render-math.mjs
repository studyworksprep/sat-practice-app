// Shared server-side math rendering. Imported by both the offline
// backfill script (scripts/render-math.mjs) and the admin draft
// preview Server Action (app/next/(admin)/admin/content/drafts/
// [draftId]/actions.js). Kept free of Node-stream / stdio side
// effects so it can be called cleanly from either context.
//
// Math handled: `<math>…</math>` (Presentation MathML, the dominant
// format in the question bank) and `\(…\)` / `\[…\]` TeX
// delimiters. Output is inline SVG with glyph paths embedded per
// expression (`fontCache: 'none'`) so each rendered HTML blob is
// self-contained — no client-side stylesheet or font dependency.
//
// Non-math content (text, `<p>`, `<figure>`, pre-existing `<svg>`
// figures, `<img>`) passes through untouched. Renders that produce
// output byte-identical to input return null so the caller can
// leave the rendered column NULL and fall back to raw HTML.
//
// The preload/setup block MUST import mathjax-full/js/util/entities/
// all.js before any document is created; otherwise MathJax's
// async entity loader is triggered mid-render, resolves too late
// for the sync doc.render() call, and the handler state degrades.

import { createHash } from 'node:crypto';
import 'mathjax-full/js/util/entities/all.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { MathML } from 'mathjax-full/js/input/mathml.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

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
 * Throws on MathJax errors — callers should wrap in try/catch.
 *
 * Single document with both input jaxes — MathJax's findMath() runs
 * each input jax against the DOM and unions the matches, so both
 * TeX delimiters and <math> elements are caught in one pass without
 * needing to re-parse the intermediate HTML.
 */
export function renderHtml(html) {
  if (html == null || html === '') return html;
  const doc = mathjax.document(html, {
    InputJax: [tex, mml],
    OutputJax: svg,
  });
  doc.render();
  return adaptor.innerHTML(adaptor.body(doc.document));
}

/**
 * Render + swallow errors. On failure, returns the input HTML
 * unchanged and calls onError (if provided) with a context label.
 */
export function safeRender(html, label, onError) {
  try {
    return renderHtml(html);
  } catch (err) {
    if (typeof onError === 'function') onError(label, err);
    return html;
  }
}

/**
 * Render, but return null when the output is byte-identical to the
 * input. Lets callers store NULL in rendered columns for rows
 * where no math was present — read path falls back to raw HTML.
 */
export function renderIfChanged(html, label, onError) {
  if (html == null || html === '') return null;
  const out = safeRender(html, label, onError);
  return out === html ? null : out;
}

/**
 * Render an options jsonb array. Each element gets
 * content_html_rendered populated only when its content_html
 * actually changed under the renderer. If no option changed,
 * returns null so options_rendered stays NULL.
 */
export function renderOptions(options, rowId, onError) {
  if (!Array.isArray(options)) return null;
  let anyChanged = false;
  const mapped = options.map((opt, i) => {
    if (opt == null || typeof opt !== 'object') return opt;
    const rendered = opt.content_html
      ? renderIfChanged(opt.content_html, `${rowId} options[${i}]`, onError)
      : null;
    if (rendered != null) anyChanged = true;
    return { ...opt, content_html_rendered: rendered };
  });
  return anyChanged ? mapped : null;
}

/**
 * md5 over the source fields, matching what the orchestrator
 * stores in questions_v2.rendered_source_hash so staleness is
 * detectable.
 */
export function sourceHash({ stem_html, stimulus_html, rationale_html, options }) {
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

/**
 * Render one row end-to-end. Returns the five fields the backfill
 * writes: stem_rendered, stimulus_rendered, rationale_rendered,
 * options_rendered, rendered_source_hash.
 */
export function renderRow(row, onError) {
  return {
    id: row.id,
    stem_rendered: renderIfChanged(row.stem_html, `${row.id} stem`, onError),
    stimulus_rendered: renderIfChanged(row.stimulus_html, `${row.id} stimulus`, onError),
    rationale_rendered: renderIfChanged(row.rationale_html, `${row.id} rationale`, onError),
    options_rendered: renderOptions(row.options, row.id, onError),
    rendered_source_hash: sourceHash(row),
  };
}
