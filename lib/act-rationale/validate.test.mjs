import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFigureUrls, validateRationale } from './validate.ts';
import { buildUserContent } from './generate.ts';

const GOOD = `<p>This tests solving a one-step equation. Subtract 4 from both sides: \\(x + 4 - 4 = 9 - 4\\), so \\(x = 5\\). That is choice <strong>H</strong>.</p>
<ul><li><strong>F</strong> comes from subtracting 9 from 4 instead of 4 from 9.</li>
<li><strong>G</strong> is the result of dividing instead of subtracting.</li>
<li><strong>J</strong> adds 4 to both sides instead of subtracting it, giving 13.</li></ul>`;

test('extractFigureUrls pulls absolute http(s) sources, de-duplicated, in order', () => {
  const urls = extractFigureUrls(
    '<p>See <img src="https://cdn.example/a.png" alt=""> and <img src=\'https://cdn.example/b.png\'></p>',
    '<img src="https://cdn.example/a.png"> <img src="data:image/png;base64,xxx"> <img src="/relative.png">',
    null,
  );
  assert.deepEqual(urls, ['https://cdn.example/a.png', 'https://cdn.example/b.png']);
});

test('a clean rationale that matches the key passes with no errors or warnings', () => {
  const r = validateRationale({
    rationaleHtml: GOOD,
    answerLetter: 'H',
    correctLabel: 'H',
    labels: ['F', 'G', 'H', 'J'],
    confidence: 'high',
  });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('a key mismatch is an error, not a warning', () => {
  const r = validateRationale({
    rationaleHtml: GOOD,
    answerLetter: 'G',
    correctLabel: 'H',
    labels: ['F', 'G', 'H', 'J'],
  });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /identified G as correct; the key is H/);
});

test('letters are compared case-insensitively and must be real labels', () => {
  const ok = validateRationale({ rationaleHtml: GOOD, answerLetter: 'h', correctLabel: 'H', labels: ['F', 'G', 'H', 'J'] });
  assert.deepEqual(ok.errors, []);
  const bad = validateRationale({ rationaleHtml: GOOD, answerLetter: 'C', correctLabel: 'H', labels: ['F', 'G', 'H', 'J'] });
  assert.ok(bad.errors.some((e) => /not one of the option labels/.test(e)));
});

test('empty rationale and missing letter are errors', () => {
  const r = validateRationale({ rationaleHtml: '  ', answerLetter: '', correctLabel: 'A', labels: ['A', 'B', 'C', 'D'] });
  assert.ok(r.errors.some((e) => /empty/i.test(e)));
  assert.ok(r.errors.some((e) => /No answer letter/.test(e)));
});

test('soft problems are warnings: images, markdown, length, unmentioned options, low confidence', () => {
  const r = validateRationale({
    rationaleHtml: '<p>**Short** <img src="https://x/y.png"> B is right.</p>',
    answerLetter: 'B',
    correctLabel: 'B',
    labels: ['A', 'B', 'C', 'D'],
    confidence: 'low',
  });
  assert.deepEqual(r.errors, []);
  assert.ok(r.warnings.some((w) => /<img>/.test(w)));
  assert.ok(r.warnings.some((w) => /markdown/i.test(w)));
  assert.ok(r.warnings.some((w) => /Short/.test(w)));
  assert.ok(r.warnings.some((w) => /options A, C, D/.test(w)));
  assert.ok(r.warnings.some((w) => /confidence: low/.test(w)));
});

test('buildUserContent attaches figures as image blocks before the JSON text block', () => {
  const blocks = buildUserContent({
    id: 'q1',
    section: 'science',
    category: 'Data Representation',
    subcategory: null,
    stimulus_html: '<p>Figure 1 <img src="https://cdn.example/fig1.png"></p>',
    stem_html: '<p>According to Figure 1, which is greatest?</p>',
    options: [
      { label: 'A', content_html: '<p>1</p>', is_correct: false },
      { label: 'B', content_html: '<p>2</p>', is_correct: true },
    ],
  });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].type, 'image');
  assert.equal(blocks[0].source.url, 'https://cdn.example/fig1.png');
  assert.equal(blocks[1].type, 'text');
  assert.match(blocks[1].text, /^Science:/);
  const json = JSON.parse(blocks[1].text.split('Question:\n')[1]);
  assert.equal(json.figures_attached, 1);
  assert.equal(json.options[1].is_correct, true);
});
