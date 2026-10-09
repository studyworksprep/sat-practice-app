import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { parseBoundedMathSpeech as parse } from './parse-bounded-math-speech.ts';
import { renderHtml } from './render-math.mjs';

test('bounded speech preserves decimals, thousands, function fractions and nested algebra', () => {
  assert.equal(parse('1 point 0 8 2 to the q power'), '1.082^{q}');
  assert.equal(parse('S of 0 equals 38,000'), 'S\\left(0\\right) = 38{,}000');
  assert.equal(parse('f of x over g of x'), '\\frac{f\\left(x\\right)}{g\\left(x\\right)}');
  assert.equal(parse('the fraction with numerator x plus 1 and denominator open parenthesis b minus 2 close parenthesis'), '\\frac{x + 1}{\\left(b - 2\\right)}');
  assert.equal(parse('x equals plus or minus the square root of 3'), 'x = \\pm \\sqrt{3}');
  assert.equal(parse('x to the five halves power'), 'x^{\\frac{5}{2}}');
  assert.equal(parse('five ninths'), '\\frac{5}{9}');
  assert.equal(parse('with coordinates 0 comma three halves'), '\\left(0 , \\frac{3}{2}\\right)');
  assert.equal(parse('16 minus negative 8'), '16 - \\left(-8\\right)');
  assert.equal(parse('the fraction 1 over x plus 5 end fraction'), '\\frac{1}{x + 5}');
});

test('unknown speech and ambiguous boundaries require a visual transcription', () => {
  for (const speech of ['the square root of x squared', 'the fraction 1 over x plus 5',
    'x over 2 y', 'f of x squared', 'the fraction with numerator 1 and denominator b minus 2',
    'x comma y', 'x plus imaginary prose', '', 'the square root of x plus 1']) {
    assert.equal(parse(speech), null, speech);
  }
});

test('reviewed source-image overrides retain geometry markings and known missing terms', async () => {
  const registry = JSON.parse(await readFile(new URL('../../scripts/verification/dc-question-math-transcriptions.json', import.meta.url), 'utf8'));
  const images = registry.math_images;
  assert.equal(new Set(images.map((m: { src_sha256: string }) => m.src_sha256)).size, images.length);
  assert.ok(images.some((m: { code: string; tex: string }) => m.code === 'M-00843' && m.tex === '(a-2)(a-8)=0'));
  assert.ok(images.some((m: { code: string; tex: string }) => m.code === 'M-00811' && m.tex === '\\widehat{AC}'));
  for (const image of images) {
    assert.match(image.src_sha256, /^[a-f0-9]{64}$/);
    assert.ok(image.tex.trim());
    assert.doesNotMatch(renderHtml('\\(' + image.tex + '\\)'), /data-mjx-error|data-mml-node="merror"/);
  }
});
