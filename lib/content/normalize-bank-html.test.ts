import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseHTML } from 'linkedom';
import { docToBankHtml } from './bank-html.ts';
import { normalizeBankHtml } from './normalize-bank-html.ts';
import { sanitizeQuestionHtml } from '../sanitize.ts';
import { renderHtml } from './render-math.mjs';

test('authored display equations retain their centering through the application sanitizer', () => {
  const doc = { type: 'doc', content: [{ type: 'mathBlock', attrs: { latex: 'x+y=18' } }] };
  for (const kind of ['stem', 'stimulus', 'rationale'] as const) {
    const html = docToBankHtml(doc, kind);
    assert.match(sanitizeQuestionHtml(html), /style="text-align:center;?"/);
    assert.doesNotMatch(html, /align=/);
  }
});

test('normalization preserves literal comparison operators and alignment tokens in existing TeX', () => {
  const html = '<p>For \\(0 < a < b\\), \\[\\begin{aligned}x&=1\\\\y&=2\\end{aligned}\\]</p>';
  const normalized = normalizeBankHtml(html, 'stem')!;
  assert.ok(normalized.includes('\\(0 < a < b\\)'));
  assert.ok(normalized.includes('x&=1\\\\y&=2'));
  assert.equal(normalizeBankHtml(normalized, 'stem'), normalized);
  const rendered = renderHtml(normalized);
  assert.doesNotMatch(rendered, /data-mjx-error|data-mml-node="merror"|SWBANKMATHTOKEN/);
  assert.equal((rendered.match(/<mjx-container/g) ?? []).length, 2);
});

test('only a reviewed equation image is converted; other equations and figures survive', () => {
  const src = 'data:image/png;base64,AAA';
  const graphSrc = 'data:image/png;base64,BBB';
  const html = `<p><img role="math" src="${src}" alt="x squared">, <img class="math-img" src="missing" alt="fraction with uncertain grouping"></p><p><img src="${graphSrc}" alt="Graph of a line"></p>`;
  const mathImages = new Map([[src, { alt: 'x squared', tex: 'x^2' }]]);
  const normalized = normalizeBankHtml(html, 'stimulus', { mathImages })!;
  const body = parseHTML('<html><body>' + normalized + '</body></html>').document.body;
  assert.ok(normalized.includes('\\(x^2\\)'));
  assert.equal(body.querySelector('img[role="math"]')?.getAttribute('src'), 'missing');
  assert.equal(body.querySelector('img:not([role="math"])')?.getAttribute('src'), graphSrc);
  assert.equal(body.querySelector('img:not([role="math"])')?.getAttribute('alt'), 'Graph of a line');
  assert.throws(() => normalizeBankHtml(html, 'stimulus', { mathImages, requireReviewedMath: true }), /Unreviewed equation/);
  assert.throws(() => normalizeBankHtml(html, 'stimulus', { mathImages: new Map([[src, { alt: 'different formula', tex: 'x^2' }]]) }), /does not match/);
});

test('table captions, cell spans and data remain intact while imported presentation is removed', () => {
  const html = '<div class="qti-wrapper"><table width="120" class="old-table"><caption>Residents</caption><tr><th colspan="2">Percent</th></tr><tr><td rowspan="2">A</td><td>21.9</td></tr><tr><td>27.9</td></tr></table></div>';
  const normalized = normalizeBankHtml(html, 'stimulus')!;
  const dom = parseHTML('<html><body>' + normalized + '</body></html>').document.body;
  assert.equal(dom.querySelector('caption')?.textContent, 'Residents');
  assert.equal(dom.querySelector('th')?.getAttribute('colspan'), '2');
  assert.equal(dom.querySelector('td')?.getAttribute('rowspan'), '2');
  assert.deepEqual([...dom.querySelectorAll('td')].map(n => n.textContent), ['A', '21.9', '27.9']);
  assert.equal(dom.querySelector('table')?.getAttribute('class'), 'stimulus_table');
  assert.doesNotMatch(normalized, /qti-wrapper|width=|old-table/);
  assert.equal(normalizeBankHtml(normalized, 'stimulus'), normalized);
});

test('reviewed variables receive math formatting and prose italics remain semantic emphasis', () => {
  const html = '<p align="Center" class="old"><span class="italic">x.</span> <span class="italic">important</span></p>';
  const normalized = normalizeBankHtml(html, 'rationale', { mathVariables: new Set(['x']) })!;
  assert.ok(normalized.includes('\\(x\\). <em>important</em>'));
  assert.match(normalized, /<p style="text-align:center;?">/);
  assert.equal(normalizeBankHtml(normalized, 'rationale'), normalized);
  assert.equal(normalizeBankHtml('<p>60%</p>', 'option'), '\\(60\\%\\)');
  assert.equal(normalizeBankHtml('   ', 'rationale'), null);
  assert.throws(() => normalizeBankHtml('<span data-ae_invis="true">actual content</span>', 'stem'), /Invisible source node/);
});
