import test from 'node:test';
import assert from 'node:assert/strict';

import { gradeSprAnswer, normalizeText, toStrictNumber } from './spr-grade.mjs';

// Characterization tests: this module was extracted from two identical
// copies (session-actions.ts, practice-test/grading.js). These pin the
// behavior those callers relied on so the extraction — and the lesson
// runtime now sharing it — cannot drift.

test('toStrictNumber parses numbers, decimals, and a/b fractions', () => {
  assert.equal(toStrictNumber('12'), 12);
  assert.equal(toStrictNumber(' 12.5 '), 12.5);
  assert.equal(toStrictNumber('.5'), 0.5);
  assert.equal(toStrictNumber('-3/4'), -0.75);
  assert.equal(toStrictNumber('25/2'), 12.5);
  assert.equal(toStrictNumber(7), 7);
});

test('toStrictNumber rejects trailing garbage and bad fractions', () => {
  // parseFloat("23/60") is 23 — the collision this parser exists to stop.
  assert.ok(Number.isNaN(toStrictNumber('23abc')));
  assert.ok(Number.isNaN(toStrictNumber('abc')));
  assert.ok(Number.isNaN(toStrictNumber('1/0')));
  assert.ok(Number.isNaN(toStrictNumber('50%')));
  assert.ok(Number.isNaN(toStrictNumber('')));
  assert.ok(Number.isNaN(toStrictNumber(null)));
});

test('text match normalizes case and whitespace', () => {
  assert.equal(normalizeText('  A  b '), 'a b');
  assert.equal(gradeSprAnswer(' 1/2 ', '1/2'), true);
  assert.equal(gradeSprAnswer('1/2', ['3/4', '1/2']), true);
});

test('v2 object shape: JSON-array text, numeric target, tolerance', () => {
  const correct = { text: '["1/14", ".0714"]', number: 0.0714, tolerance: null };
  assert.equal(gradeSprAnswer('1/14', correct), true);   // text
  assert.equal(gradeSprAnswer('.0714', correct), true);  // text
  assert.equal(gradeSprAnswer('0.0714', correct), true); // numeric vs target
  assert.equal(gradeSprAnswer('0.0715', correct), false); // no tolerance
  assert.equal(gradeSprAnswer('0.0715', { ...correct, tolerance: 0.001 }), true);
});

test('fractions and decimals grade as equivalent through the numeric leg', () => {
  assert.equal(gradeSprAnswer('12.5', '25/2'), true);
  assert.equal(gradeSprAnswer('25/2', '12.5'), true);
  assert.equal(gradeSprAnswer('14/2', 7), true);
  assert.equal(gradeSprAnswer('7.0', 7), true);
});

test('nearby fractions do not collide', () => {
  assert.equal(gradeSprAnswer('23/60', '23/90'), false);
  assert.equal(gradeSprAnswer('23/90', '23/90'), true);
});

test('guards: empty response, missing key, unusable key', () => {
  assert.equal(gradeSprAnswer('', '7'), false);
  assert.equal(gradeSprAnswer('7', null), false);
  assert.equal(gradeSprAnswer('7', undefined), false);
  assert.equal(gradeSprAnswer('7', {}), false);
});

test('non-numeric text keys still match by text only', () => {
  assert.equal(gradeSprAnswer('50%', '50%'), true);
  assert.equal(gradeSprAnswer('50', '50%'), false);
});
