// Scan questions_v2 HTML for <img role="math"> elements and
// replace each one's alt text — when parseable via the speak-math
// grammar — with \(LaTeX\) the renderer can typeset. Failed parses
// leave the <img> untouched so the row degrades gracefully.
//
// Shape: pure function per HTML blob; a companion helper handles
// the options jsonb mirror shape. The orchestrator (drafts
// generator or direct-UPDATE script) composes these over a full
// row and decides whether to write drafts or patch prod directly.

import { parseOrNull } from './speakmath-to-tex.mjs';

// Every <img …> tag carrying role="math", regardless of attribute
// order. The element is self-closing in practice (CB's HTML), so
// we don't need to worry about pairing with a closing </img>.
const RE_IMG_MATH = /<img\b[^>]*\brole="math"[^>]*\/?>/g;
const RE_ALT      = /\balt="([^"]*)"/;

/**
 * @param {string|null} html
 * @returns {{ html: string|null, total: number, replaced: number }}
 */
export function replaceMathImages(html) {
  if (html == null || html === '') return { html, total: 0, replaced: 0 };
  let total = 0;
  let replaced = 0;
  const out = html.replace(RE_IMG_MATH, (match) => {
    total++;
    const m = match.match(RE_ALT);
    if (!m) return match;
    const latex = parseOrNull(m[1]);
    if (latex == null) return match;
    replaced++;
    return `\\(${latex}\\)`;
  });
  return { html: out, total, replaced };
}

/**
 * Apply replaceMathImages to each option's content_html. Returns
 * the patched options array and aggregate stats.
 */
export function replaceMathImagesInOptions(options) {
  if (!Array.isArray(options)) return { options, total: 0, replaced: 0 };
  let total = 0, replaced = 0;
  const mapped = options.map((opt) => {
    if (opt == null || typeof opt !== 'object' || opt.content_html == null) return opt;
    const r = replaceMathImages(opt.content_html);
    total += r.total;
    replaced += r.replaced;
    return { ...opt, content_html: r.html };
  });
  return { options: mapped, total, replaced };
}

/**
 * Apply across every content surface of a questions_v2 row.
 * Returns the proposed replacements and a per-field "changed"
 * flag so the caller can decide which fields to write.
 */
export function replaceMathImagesInRow(row) {
  const stem = replaceMathImages(row.stem_html);
  const stim = replaceMathImages(row.stimulus_html);
  const rat  = replaceMathImages(row.rationale_html);
  const opts = replaceMathImagesInOptions(row.options);

  return {
    stem_html:      stem.html,
    stimulus_html:  stim.html,
    rationale_html: rat.html,
    options:        opts.options,
    changed: {
      stem:      stem.replaced > 0,
      stimulus:  stim.replaced > 0,
      rationale: rat.replaced > 0,
      options:   opts.replaced > 0,
    },
    total:    stem.total + stim.total + rat.total + opts.total,
    replaced: stem.replaced + stim.replaced + rat.replaced + opts.replaced,
  };
}
