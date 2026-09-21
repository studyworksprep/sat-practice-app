// Unit tests for the MathJax SVG ex→em rewrite (lib/content/
// math-svg-units.ts). The fixture is verbatim render-math.mjs output
// for `<math><mn>55</mn></math>` (paths trimmed).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATH_SCALE,
  TEX_X_HEIGHT,
  normalizeMathSvgUnits,
} from './math-svg-units.ts';

const RENDERED =
  '<p>selected <mjx-container class="MathJax" jax="SVG">' +
  '<svg style="vertical-align: -0.05ex;" xmlns="http://www.w3.org/2000/svg" ' +
  'width="2.262ex" height="1.557ex" role="img" focusable="false" viewBox="0 -666 1000 688">' +
  '<g stroke="currentColor" fill="currentColor" stroke-width="0" transform="scale(1,-1)">' +
  '<g data-mml-node="math"><g data-mml-node="mn"><path data-c="35" d="M164 157Z"></path>' +
  '</g></g></g></svg></mjx-container> teams</p>';

test('rewrites width, height and vertical-align from ex to em', () => {
  const out = normalizeMathSvgUnits(RENDERED);
  // 2.262ex × 0.442 × 1.2355 = 1.2355em — one em of TeX math renders
  // at the pinned scale, same as the CHTML path.
  assert.match(out, /width="1\.235em"/);
  assert.match(out, /height="0\.85em"/);
  assert.match(out, /vertical-align: -0\.027em;/);
  assert.doesNotMatch(out, /\dex\b/);
  // Everything else on the tag survives untouched.
  assert.match(out, /viewBox="0 -666 1000 688"/);
  assert.match(out, /role="img" focusable="false"/);
  // And the text around the math is not rewritten.
  assert.match(out, /^<p>selected <mjx-container/);
  assert.match(out, / teams<\/p>$/);
});

test('conversion factor is the TeX x-height at the pinned scale', () => {
  const out = normalizeMathSvgUnits('<svg width="1ex" viewBox="0 0 1 1"></svg>');
  const em = Number(out.match(/width="([\d.]+)em"/)[1]);
  assert.equal(em, Number((TEX_X_HEIGHT * MATH_SCALE).toFixed(3)));
});

test('is idempotent', () => {
  const once = normalizeMathSvgUnits(RENDERED);
  assert.equal(normalizeMathSvgUnits(once), once);
});

test('leaves HTML without ex-sized svg alone', () => {
  const plain = '<p>The index <em>exceeds</em> 3 examples of <code>flex</code></p>';
  assert.equal(normalizeMathSvgUnits(plain), plain);
  const figure = '<svg width="120" height="80" viewBox="0 0 120 80"><rect width="10" height="10"/></svg>';
  assert.equal(normalizeMathSvgUnits(figure), figure);
  assert.equal(normalizeMathSvgUnits(''), '');
});

test('does not touch ex units outside the svg start tag', () => {
  const html =
    '<p style="margin-left: 2ex">x <svg width="1ex" viewBox="0 0 1 1"></svg> y</p>';
  const out = normalizeMathSvgUnits(html);
  assert.match(out, /margin-left: 2ex/);
  assert.match(out, /width="0\.546em"/);
});

test('handles negative and leading-dot values', () => {
  const out = normalizeMathSvgUnits(
    '<svg style="vertical-align: -.25ex;" width=".5ex" height="10ex" viewBox="0 0 1 1"></svg>',
  );
  assert.match(out, /vertical-align: -0\.137em;/);
  assert.match(out, /width="0\.273em"/);
  assert.match(out, /height="5\.461em"/);
});
