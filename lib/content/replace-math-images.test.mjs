import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOrNull } from './speakmath-to-tex.mjs';
import { replaceMathImages, replaceMathImagesInRow } from './replace-math-images.mjs';

const image = alt => `<img role="math" src="data:image/png;base64,AAA" alt="${alt}">`;

test('legacy speech conversion preserves images whose multiplication notation is unknown', () => {
  for (const alt of ['a, times pi', '2 times the square root of 3',
    '10 times 16', 'm times 100', '5 point 1 2 times 10 to the power 8',
    '0 point 2 times 25 equals 5', '2 TIMES 3', '2\ntimes\t3']) {
    assert.equal(parseOrNull(alt), null, alt);
    const html = `<p>${image(alt)}</p>`;
    assert.deepEqual(replaceMathImages(html), { html, total: 1, replaced: 0 });
  }
});

test('all question surfaces retain ambiguous images and authored multiplication', () => {
  const row = { stem_html: image('a times pi'), stimulus_html: image('m times 100'),
    rationale_html: '<p>\\(0.2 \\times 25=5\\)</p>' + image('10 times 16'),
    options: [{ label: 'A', content_html: image('2 times the square root of 3') }] };
  const result = replaceMathImagesInRow(row);
  for (const field of ['stem_html', 'stimulus_html', 'rationale_html', 'options']) {
    assert.deepEqual(result[field], row[field]);
  }
  assert.deepEqual(result.changed, { stem: false, stimulus: false, rationale: false, options: false });
  assert.equal(result.total, 4);
  assert.equal(result.replaced, 0);
  assert.equal(replaceMathImages(image('x squared')).replaced, 1);
});
