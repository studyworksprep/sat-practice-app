// The tutor's student page: finished-but-unreviewed work comes first,
// then open work, then everything already reviewed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPracticeTestAssignment, splitForReview } from './assignment-review.ts';

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

// ── Practice tests: which assignment did an attempt complete? ───────

const ptRow = (id, { test = 'pt1', type = 'sat', completed = '2026-11-10T12:00:05Z', created = '2026-11-01T00:00:00Z', kind = 'practice_test', archived = null, deleted = null } = {}) => ({
  assignment_id: id,
  completed_at: completed,
  assignment: {
    assignment_type: kind,
    test_type: type,
    practice_test_id: type === 'sat' ? test : null,
    act_source_test: type === 'act' ? test : null,
    deleted_at: deleted,
    archived_at: archived,
    created_at: created,
  },
});
const attempt = (finishedAt, otherFinishedAt = [], over = {}) => ({ testType: 'sat', testId: 'pt1', finishedAt, otherFinishedAt, ...over });

test('an attempt matches the assignment of the same test it completed', () => {
  const rows = [ptRow('a')];
  assert.equal(pickPracticeTestAssignment(rows, attempt('2026-11-10T12:00:00Z'))?.assignment_id, 'a');
});

test('an attempt finished after the assignment was completed is not its report', () => {
  const rows = [ptRow('a')];
  assert.equal(pickPracticeTestAssignment(rows, attempt('2026-11-12T09:00:00Z')), null);
});

test('only the latest attempt finished in time counts', () => {
  const rows = [ptRow('a', { completed: '2026-11-10T12:00:05Z' })];
  // Two attempts before completion: the earlier one is not the report.
  assert.equal(
    pickPracticeTestAssignment(rows, attempt('2026-11-03T10:00:00Z', ['2026-11-03T10:00:00Z', '2026-11-10T12:00:00Z'])),
    null,
  );
  assert.equal(
    pickPracticeTestAssignment(rows, attempt('2026-11-10T12:00:00Z', ['2026-11-03T10:00:00Z', '2026-11-10T12:00:00Z']))?.assignment_id,
    'a',
  );
});

test('other tests, other kinds and retired assignments never match', () => {
  const at = attempt('2026-11-10T12:00:00Z');
  assert.equal(pickPracticeTestAssignment([ptRow('a', { test: 'pt2' })], at), null);
  assert.equal(pickPracticeTestAssignment([ptRow('a', { kind: 'questions' })], at), null);
  assert.equal(pickPracticeTestAssignment([ptRow('a', { archived: '2026-11-11T00:00:00Z' })], at), null);
  assert.equal(pickPracticeTestAssignment([ptRow('a', { deleted: '2026-11-11T00:00:00Z' })], at), null);
  assert.equal(pickPracticeTestAssignment([ptRow('a', { completed: null })], at), null);
  // An SAT attempt never matches an ACT assignment with the same id string.
  assert.equal(pickPracticeTestAssignment([ptRow('a', { type: 'act' })], at), null);
});

test('ACT attempts match on the source test', () => {
  const rows = [ptRow('act-a', { type: 'act', test: 'form-74' })];
  const at = attempt('2026-11-10T12:00:00Z', [], { testType: 'act', testId: 'form-74' });
  assert.equal(pickPracticeTestAssignment(rows, at)?.assignment_id, 'act-a');
});

test('the same test assigned twice: the most recently assigned copy wins', () => {
  const rows = [
    ptRow('older', { created: '2026-10-01T00:00:00Z' }),
    ptRow('newer', { created: '2026-11-05T00:00:00Z' }),
  ];
  assert.equal(pickPracticeTestAssignment(rows, attempt('2026-11-10T12:00:00Z'))?.assignment_id, 'newer');
});
