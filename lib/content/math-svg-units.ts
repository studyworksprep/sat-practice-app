// Pre-rendered math (lib/content/render-math.mjs → the *_rendered
// columns) is MathJax SVG output, and MathJax sizes every <svg> in
// `ex`: width / height attributes plus the `vertical-align` that
// seats it on the baseline. The number of ex is the expression's
// em-size divided by the TeX font's x-height (0.442), so the glyphs
// come out matching the surrounding text's x-height — the same
// "matchFontHeight" look the client-side CHTML path pins with
// `chtml.scale` in app/layout.js.
//
// That works only as well as the browser's `ex` resolution, and
// WebKit's is not stable:
//
//   - Under page zoom (⌘+ or a per-site zoom in Safari) WebKit
//     resolves `ex` in CSS pixels that already include the zoom, so
//     ex-sized boxes grow by the zoom factor a second time relative
//     to em/px-sized text. Measured with a headless WKWebView on
//     macOS 26.5: an svg width of 2.262ex laid out at 17.7px at 100%
//     zoom, 20.4px at 115% and 26.6px at 150%, while the same box in
//     em held at 18.5px throughout. Chrome and Firefox never scale
//     `ex` this way, so the inflation only shows in Safari — exactly
//     the "math is bigger than the numbers next to it" report.
//   - Older WebKit builds also rounded the font's x-height up to a
//     whole pixel before multiplying (fixed upstream in WebKit PR
//     #73335, September 2026): ~10% extra at a 15px prose size.
//
// Both go away if the svg is sized in `em`, which every engine
// resolves from the font-size alone. This module rewrites the ex
// values to em at the read seam (lib/sanitize.ts) so it covers every
// row already in the *_rendered columns as well as on-the-fly
// renders (hints), without a bank re-render. The conversion factor
// is the TeX x-height times the intended scale, i.e. what `ex`
// resolves to in Chrome against Inter (x-height 0.546em) — Chrome's
// rendering is unchanged to the sub-pixel; Safari's now matches it.

/** MathJax TeX font x-height in em — the divisor MathJax's SVG
 *  output uses when it expresses em sizes in ex. */
export const TEX_X_HEIGHT = 0.442;

/** Visual scale of math relative to the surrounding text. Equals
 *  Inter's x-height (0.5461em) ÷ TEX_X_HEIGHT, which is what MathJax's
 *  matchFontHeight measurement produces against Inter — see the
 *  `chtml.scale` comment in app/layout.js, which uses this same
 *  constant so the client (CHTML) and pre-rendered (SVG) paths agree.
 *  Re-measure if --font-sans ever stops being Inter. */
export const MATH_SCALE = 1.2355;

const EM_PER_EX = TEX_X_HEIGHT * MATH_SCALE;

const NUMBER = '(-?(?:\\d+\\.?\\d*|\\.\\d+))';
const ATTR_EX = new RegExp(`\\b(width|height)="${NUMBER}ex"`, 'g');
const STYLE_EX = new RegExp(`(vertical-align:\\s*)${NUMBER}ex`, 'g');
// Only MathJax's own svg tags — they always carry jax="SVG" on the
// wrapping mjx-container, but the attributes we rewrite live on the
// <svg> start tag, and matching just that tag keeps this a plain
// string pass (no DOM needed on either side of the SSR boundary).
const SVG_TAG = /<svg\b[^>]*>/g;

function exToEm(value: string): string {
  const em = Number(value) * EM_PER_EX;
  // 3 decimals matches MathJax's own precision (it emits ex to 3 dp).
  return `${Number(em.toFixed(3))}em`;
}

/**
 * Rewrite the `ex`-based sizing on MathJax SVG output to `em` so the
 * math renders at the same size in every engine, zoomed or not.
 * Idempotent; a no-op on HTML that has no ex-sized <svg>.
 */
export function normalizeMathSvgUnits(html: string): string {
  if (!html || !html.includes('ex')) return html;
  return html.replace(SVG_TAG, (tag) => {
    if (!tag.includes('ex')) return tag;
    return tag
      .replace(ATTR_EX, (_m, attr: string, n: string) => `${attr}="${exToEm(n)}"`)
      .replace(STYLE_EX, (_m, prefix: string, n: string) => `${prefix}${exToEm(n)}`);
  });
}
