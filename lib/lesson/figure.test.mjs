import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLessonFigure, validateLessonFigure } from './figure.mjs';

// ─── normalizeLessonFigure ────────────────────────────────────────

test('normalize returns null when the block has no figure', () => {
  assert.equal(normalizeLessonFigure(null), null);
  assert.equal(normalizeLessonFigure({}), null);
  assert.equal(normalizeLessonFigure({ content: {} }), null);
});

test('normalize returns null for a figure without a usable src', () => {
  assert.equal(normalizeLessonFigure({ content: { figure: {} } }), null);
  assert.equal(normalizeLessonFigure({ content: { figure: { src: '  ' } } }), null);
  assert.equal(normalizeLessonFigure({ content: { figure: 'x.svg' } }), null);
  assert.equal(normalizeLessonFigure({ content: { figure: ['x.svg'] } }), null);
});

test('normalize trims fields and nulls an empty caption', () => {
  const figure = normalizeLessonFigure({
    content: {
      figure: { src: ' /images/tri.svg ', alt: ' Two triangles ', caption: '  ' },
    },
  });
  assert.deepEqual(figure, {
    src: '/images/tri.svg',
    alt: 'Two triangles',
    caption: null,
  });
});

test('normalize keeps a real caption', () => {
  const figure = normalizeLessonFigure({
    content: {
      figure: { src: '/images/tri.svg', alt: 'Two triangles', caption: 'Figure 1' },
    },
  });
  assert.equal(figure.caption, 'Figure 1');
});

// ─── validateLessonFigure ─────────────────────────────────────────

test('validate accepts a missing figure', () => {
  assert.deepEqual(validateLessonFigure(null), []);
  assert.deepEqual(validateLessonFigure(undefined), []);
});

test('validate rejects a non-object figure outright', () => {
  assert.equal(validateLessonFigure('x.svg').length, 1);
  assert.equal(validateLessonFigure(['x.svg']).length, 1);
});

test('validate requires src and alt', () => {
  const errors = validateLessonFigure({ caption: 'Figure 1' });
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.includes('figure.src')));
  assert.ok(errors.some((e) => e.includes('figure.alt')));
});

test('validate rejects an empty caption but accepts a missing one', () => {
  assert.equal(
    validateLessonFigure({ src: 'x.svg', alt: 'x', caption: ' ' }).length,
    1,
  );
  assert.deepEqual(validateLessonFigure({ src: 'x.svg', alt: 'x' }), []);
  assert.deepEqual(
    validateLessonFigure({ src: 'x.svg', alt: 'x', caption: 'Figure 1' }),
    [],
  );
});
