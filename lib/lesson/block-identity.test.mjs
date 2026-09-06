import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileBlockRows, stableBlockKey } from './block-identity.ts';

const stored = [
  { id: 'u-intro', sort_order: 0, block_type: 'text', content: { id: 'intro', html: '<p>Hi</p>' } },
  { id: 'u-c1', sort_order: 1, block_type: 'check', content: { prompt: 'What is <em>2+2</em>?', choices: [] } },
  { id: 'u-d1', sort_order: 2, block_type: 'desmos_interactive', content: { id: 'graph_it', title: 'Graph it' } },
  { id: 'u-c2', sort_order: 3, block_type: 'check', content: { prompt: 'Same prompt' } },
  { id: 'u-c3', sort_order: 4, block_type: 'check', content: { prompt: 'Same prompt' } },
  { id: 'u-done', sort_order: 5, block_type: 'lesson_complete', content: {} },
];

test('stableBlockKey prefers content.id, falls back to normalised text, singleton terminal', () => {
  assert.equal(stableBlockKey({ block_type: 'text', content: { id: 'intro', html: 'x' } }), 'text|id:intro');
  assert.equal(
    stableBlockKey({ block_type: 'check', content: { prompt: '  What is <em>2+2</em>? ' } }),
    'check|text:what is 2+2 ?',
  );
  assert.equal(stableBlockKey({ block_type: 'lesson_complete', content: {} }), 'lesson_complete|singleton');
  assert.equal(stableBlockKey({ block_type: 'check', content: {} }), null);
  assert.equal(stableBlockKey({ block_type: '', content: { id: 'x' } }), null);
});

test('re-import with edited copy keeps every uuid the student progress points at', () => {
  const incoming = [
    { block_type: 'text', content: { id: 'intro', html: '<p>Hi there</p>' } },       // same id, new html
    { block_type: 'check', content: { prompt: 'What is <em>2+2</em>?', choices: ['4'] } }, // same prompt
    { block_type: 'text', content: { id: 'new_aside', html: '<p>New</p>' } },        // brand new
    { block_type: 'desmos_interactive', content: { id: 'graph_it', title: 'Graph it again' } },
    { block_type: 'check', content: { prompt: 'Same prompt' } },
    { block_type: 'check', content: { prompt: 'Same prompt' } },
    { block_type: 'lesson_complete', content: { html: 'Done' } },
  ];
  const plan = reconcileBlockRows(stored, incoming);
  assert.deepEqual(plan.rows.map((r) => r.id), ['u-intro', 'u-c1', null, 'u-d1', 'u-c2', 'u-c3', 'u-done']);
  assert.deepEqual(plan.rows.map((r) => r.sort_order), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(plan.rows[0].content.html, '<p>Hi there</p>');
  assert.equal(plan.keepRows.length, 6);
  assert.equal(plan.newRows.length, 1);
  assert.deepEqual(plan.deleteIds, []);
  assert.equal(plan.reusedCount, 6);
});

test('removed blocks are deleted and duplicates match one-to-one in order', () => {
  const incoming = [
    { block_type: 'check', content: { prompt: 'Same prompt' } }, // only one of the two duplicates survives
    { block_type: 'lesson_complete', content: {} },
  ];
  const plan = reconcileBlockRows(stored, incoming);
  assert.deepEqual(plan.rows.map((r) => r.id), ['u-c2', 'u-done']);
  assert.deepEqual(plan.deleteIds, ['u-intro', 'u-c1', 'u-d1', 'u-c3']);
});

test('editor round-trip: a stored uuid on the incoming block wins over the text key', () => {
  const incoming = [
    { id: 'u-c1', block_type: 'check', content: { prompt: 'Completely rewritten prompt' } },
    { id: 'not-a-stored-id', block_type: 'check', content: { prompt: 'Same prompt' } },
  ];
  const plan = reconcileBlockRows(stored, incoming);
  assert.deepEqual(plan.rows.map((r) => r.id), ['u-c1', 'u-c2']);
});

test('a stored uuid is never reused twice', () => {
  const incoming = [
    { id: 'u-c1', block_type: 'check', content: { prompt: 'A' } },
    { id: 'u-c1', block_type: 'check', content: { prompt: 'B' } },
  ];
  const plan = reconcileBlockRows(stored, incoming);
  assert.deepEqual(plan.rows.map((r) => r.id), ['u-c1', null]);
});

test('empty lesson: everything is new, nothing to delete', () => {
  const plan = reconcileBlockRows([], [{ block_type: 'text', content: { id: 'a', html: 'x' } }]);
  assert.deepEqual(plan.rows.map((r) => r.id), [null]);
  assert.deepEqual(plan.deleteIds, []);
  assert.equal(plan.newRows.length, 1);
});
