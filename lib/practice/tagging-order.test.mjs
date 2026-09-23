import test from 'node:test';
import assert from 'node:assert/strict';
import { orderQuestionsForTagging, taggingProgress, sameIdSet } from './tagging-order.ts';

const Q = [
  { id: 'c', displayCode: 'M-00003', difficulty: 2, techniqueIds: ['t1'] },
  { id: 'a', displayCode: 'M-00001', difficulty: 1, techniqueIds: [] },
  { id: 'd', displayCode: null, difficulty: null, techniqueIds: [] },
  { id: 'b', displayCode: 'M-00002', difficulty: 3, techniqueIds: ['t1', 't2'] },
];

test('untagged first, each group in code order (null codes sort first, then by id)', () => {
  assert.deepEqual(orderQuestionsForTagging(Q, 'untagged_first'), ['d', 'a', 'b', 'c']);
});

test('code order ignores tags; tagged-only keeps just the tagged', () => {
  assert.deepEqual(orderQuestionsForTagging(Q, 'code'), ['d', 'a', 'b', 'c']);
  assert.deepEqual(orderQuestionsForTagging(Q, 'tagged_only'), ['b', 'c']);
});

test('progress counts explicit tags only', () => {
  assert.deepEqual(taggingProgress(Q), { tagged: 2, total: 4 });
  assert.deepEqual(taggingProgress([]), { tagged: 0, total: 0 });
});

test('sameIdSet is order-insensitive', () => {
  assert.ok(sameIdSet(['a', 'b'], ['b', 'a']));
  assert.ok(!sameIdSet(['a'], ['a', 'b']));
  assert.ok(sameIdSet([], []));
});
