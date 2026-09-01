// Unit tests for the Broken-panel corrections merge helpers.
// Runs under `npm run test:unit` (node --test); imports the .ts
// source directly like lib/review/schedule.test.mjs does.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  optionKey,
  mergeOptionEdits,
  buildTaxonomyPatch,
} from './corrections-patch.ts';

const OPTIONS = [
  { label: 'A', ordinal: 0, content_html: '<p>one</p>' },
  { label: 'B', ordinal: 1, content_html: '<p>two</p>' },
];

test('optionKey prefers label, then id, then position', () => {
  assert.equal(optionKey({ label: 'C', id: 'x' }, 0), 'C');
  assert.equal(optionKey({ id: 'x' }, 0), 'x');
  assert.equal(optionKey({}, 2), 'C');
  assert.equal(optionKey(null, 3), 'D');
});

test('mergeOptionEdits writes only the options that changed', () => {
  const res = mergeOptionEdits(OPTIONS, { A: '<p>fixed</p>' });
  assert.deepEqual(res.applied, ['A']);
  assert.deepEqual(res.unknownKeys, []);
  assert.equal(res.options[0].content_html, '<p>fixed</p>');
  assert.equal(res.options[0].ordinal, 0, 'sibling keys survive the merge');
  assert.equal(res.options[1], OPTIONS[1], 'untouched option kept by identity');
});

test('mergeOptionEdits ignores an edit identical to the stored HTML', () => {
  const res = mergeOptionEdits(OPTIONS, { A: '<p>one</p>' });
  assert.deepEqual(res.applied, []);
  assert.equal(res.options[0], OPTIONS[0]);
});

test('mergeOptionEdits applies an edit that clears an option', () => {
  const res = mergeOptionEdits(OPTIONS, { B: '' });
  assert.deepEqual(res.applied, ['B']);
  assert.equal(res.options[1].content_html, '');
});

test('mergeOptionEdits reports keys that match no option', () => {
  const res = mergeOptionEdits(OPTIONS, { A: '<p>fixed</p>', Z: '<p>nope</p>' });
  assert.deepEqual(res.applied, ['A']);
  assert.deepEqual(res.unknownKeys, ['Z'], 'a dropped edit must be visible');
});

test('mergeOptionEdits handles a missing/!array options column', () => {
  assert.deepEqual(mergeOptionEdits(null, { A: 'x' }), {
    options: [],
    applied: [],
    unknownKeys: ['A'],
  });
  assert.deepEqual(mergeOptionEdits(OPTIONS, null).options, OPTIONS);
});

test('mergeOptionEdits keys positionally when labels are absent', () => {
  const bare = [{ content_html: 'one' }, { content_html: 'two' }];
  const res = mergeOptionEdits(bare, { B: 'two-fixed' });
  assert.deepEqual(res.applied, ['B']);
  assert.equal(res.options[1].content_html, 'two-fixed');
});

test('buildTaxonomyPatch emits only the fields the caller sent', () => {
  assert.deepEqual(buildTaxonomyPatch({ difficulty: 3 }), { difficulty: 3 });
  assert.deepEqual(buildTaxonomyPatch({}), {});
  assert.deepEqual(buildTaxonomyPatch(null), {});
});

test('buildTaxonomyPatch clears a field set back to empty', () => {
  assert.deepEqual(buildTaxonomyPatch({ difficulty: null, scoreBand: null }), {
    difficulty: null,
    score_band: null,
  });
});

test('buildTaxonomyPatch moves domain and skill as code/name pairs', () => {
  assert.deepEqual(
    buildTaxonomyPatch({ domainCode: 'ALG', domainName: 'Algebra' }),
    { domain_code: 'ALG', domain_name: 'Algebra' },
  );
  assert.deepEqual(
    buildTaxonomyPatch({ skillCode: '', skillName: '' }),
    { skill_code: null, skill_name: null },
  );
});

test('buildTaxonomyPatch rejects a non-numeric difficulty rather than storing NaN', () => {
  assert.deepEqual(buildTaxonomyPatch({ difficulty: 'hard' }), { difficulty: null });
});
