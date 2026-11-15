// The tutor's student page: finished-but-unreviewed work comes first,
// then open work, then everything already reviewed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitForReview } from './assignment-review.ts';

const row = (id, { created = '2026-11-01T00:00:00Z', completed = null, reviewed = null } = {}) => ({
  id,
  created_at: created,
  completed_at: completed,
  reviewed_at: reviewed,
});

const ids = (rows) => rows.map((r) => r.id);

test('finished, unreviewed work is the review queue, newest finish first', () => {
  const { toReview, open, reviewed } = splitForReview([
    row('a', { completed: '2026-11-10T00:00:00Z' }),
    row('b', { completed: '2026-11-14T00:00:00Z' }),
    row('c', { completed: '2026-11-12T00:00:00Z' }),
  ]);
  assert.deepEqual(ids(toReview), ['b', 'c', 'a']);
  assert.deepEqual(open, []);
  assert.deepEqual(reviewed, []);
});

test('open work keeps the caller order and stays out of the queue', () => {
  const { toReview, open } = splitForReview([
    row('new', { created: '2026-11-12T00:00:00Z' }),
    row('old', { created: '2026-11-02T00:00:00Z' }),
  ]);
  assert.deepEqual(toReview, []);
  assert.deepEqual(ids(open), ['new', 'old']);
});

test('reviewed work leaves both lists, finished or not', () => {
  const { toReview, open, reviewed } = splitForReview([
    row('done', { completed: '2026-11-10T00:00:00Z', reviewed: '2026-11-11T00:00:00Z' }),
    row('unfinished', { created: '2026-11-13T00:00:00Z', reviewed: '2026-11-13T00:00:00Z' }),
    row('queue', { completed: '2026-11-09T00:00:00Z' }),
  ]);
  assert.deepEqual(ids(toReview), ['queue']);
  assert.deepEqual(open, []);
  // Unfinished work dates from when it was assigned.
  assert.deepEqual(ids(reviewed), ['unfinished', 'done']);
});

test('every row lands in exactly one group', () => {
  const rows = [
    row('1'),
    row('2', { completed: '2026-11-05T00:00:00Z' }),
    row('3', { reviewed: '2026-11-06T00:00:00Z' }),
    row('4', { completed: '2026-11-07T00:00:00Z', reviewed: '2026-11-08T00:00:00Z' }),
    row('5', { created: null, completed: 'not a date' }),
  ];
  const { toReview, open, reviewed } = splitForReview(rows);
  assert.equal(toReview.length + open.length + reviewed.length, rows.length);
  assert.deepEqual([...ids(toReview), ...ids(open), ...ids(reviewed)].sort(), ['1', '2', '3', '4', '5']);
});
