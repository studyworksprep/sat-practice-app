import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLessonContext, validateLessonContext } from './context.mjs';

// ─── normalizeLessonContext ───────────────────────────────────────

test('normalize returns null when the block has no context', () => {
  assert.equal(normalizeLessonContext(null), null);
  assert.equal(normalizeLessonContext({}), null);
  assert.equal(normalizeLessonContext({ content: {} }), null);
});

test('normalize returns null for a context without usable html', () => {
  assert.equal(normalizeLessonContext({ content: { context: {} } }), null);
  assert.equal(normalizeLessonContext({ content: { context: { html: '  ' } } }), null);
  assert.equal(normalizeLessonContext({ content: { context: '<p>x</p>' } }), null);
  assert.equal(normalizeLessonContext({ content: { context: ['<p>x</p>'] } }), null);
});

test('normalize trims fields and nulls an empty label', () => {
  const context = normalizeLessonContext({
    content: { context: { html: ' <p>The passage.</p> ', label: '  ' } },
  });
  assert.deepEqual(context, { html: '<p>The passage.</p>', label: null });
});

test('normalize keeps a real label', () => {
  const context = normalizeLessonContext({
    content: { context: { html: '<p>The passage.</p>', label: 'Passage' } },
  });
  assert.equal(context.label, 'Passage');
});

// ─── validateLessonContext ────────────────────────────────────────

test('validate accepts a missing context', () => {
  assert.deepEqual(validateLessonContext(null), []);
  assert.deepEqual(validateLessonContext(undefined), []);
});

test('validate rejects a non-object context outright', () => {
  assert.equal(validateLessonContext('<p>x</p>').length, 1);
  assert.equal(validateLessonContext(['<p>x</p>']).length, 1);
});

test('validate requires html', () => {
  const errors = validateLessonContext({ label: 'Passage' });
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('context.html'));
});

test('validate rejects a blank label but accepts an absent one', () => {
  assert.equal(validateLessonContext({ html: '<p>x</p>', label: ' ' }).length, 1);
  assert.deepEqual(validateLessonContext({ html: '<p>x</p>' }), []);
  assert.deepEqual(validateLessonContext({ html: '<p>x</p>', label: 'Table' }), []);
});
