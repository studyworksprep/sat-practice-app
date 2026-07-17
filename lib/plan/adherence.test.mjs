// Adherence classification tests (§2.4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAdherence,
  adherenceSummaryLine,
  ON_TRACK_RATE,
} from './adherence.ts';

const TODAY = '2026-07-17';

function t(scheduledDate, status = 'pending') {
  return { scheduledDate, status };
}

test('empty plan is not_started', () => {
  const a = computeAdherence([], TODAY);
  assert.equal(a.status, 'not_started');
  assert.equal(a.completionRate, null);
  assert.equal(adherenceSummaryLine(a), 'No tasks due yet');
});

test('all tasks in the future is not_started', () => {
  const a = computeAdherence([t('2026-07-20'), t('2026-07-25')], TODAY);
  assert.equal(a.status, 'not_started');
  assert.equal(a.dueCount, 0);
});

test('everything due completed with no future work done is on_track', () => {
  const a = computeAdherence(
    [t('2026-07-10', 'completed'), t('2026-07-15', 'completed'), t('2026-07-20')],
    TODAY,
  );
  assert.equal(a.status, 'on_track');
  assert.equal(a.completionRate, 1);
  assert.equal(a.overdueCount, 0);
});

test('a task scheduled today counts as due', () => {
  const a = computeAdherence([t(TODAY)], TODAY);
  assert.equal(a.dueCount, 1);
  assert.equal(a.overdueCount, 1);
});

test('mostly-missed due tasks classify as behind', () => {
  const a = computeAdherence(
    [t('2026-07-10', 'completed'), t('2026-07-11'), t('2026-07-12'), t('2026-07-13')],
    TODAY,
  );
  assert.equal(a.status, 'behind');
  assert.equal(a.overdueCount, 3);
  assert.equal(adherenceSummaryLine(a), '1 of 4 due done, 3 overdue');
});

test('threshold boundary: exactly ON_TRACK_RATE is on_track', () => {
  // 4 of 5 done = 0.8 exactly — not behind.
  const a = computeAdherence(
    [
      t('2026-07-10', 'completed'),
      t('2026-07-11', 'completed'),
      t('2026-07-12', 'completed'),
      t('2026-07-13', 'completed'),
      t('2026-07-14'),
    ],
    TODAY,
  );
  assert.equal(a.completionRate, ON_TRACK_RATE);
  assert.equal(a.status, 'on_track');
});

test('all due done plus completed future work is ahead', () => {
  const a = computeAdherence(
    [t('2026-07-10', 'completed'), t('2026-07-20', 'completed'), t('2026-07-25')],
    TODAY,
  );
  assert.equal(a.status, 'ahead');
  assert.equal(a.completedAhead, 1);
});

test('nothing due yet but future work completed is ahead', () => {
  const a = computeAdherence([t('2026-07-20', 'completed'), t('2026-07-25')], TODAY);
  assert.equal(a.status, 'ahead');
  assert.equal(adherenceSummaryLine(a), '1 done ahead of schedule');
});

test('skipped tasks count neither as done nor overdue', () => {
  const a = computeAdherence(
    [t('2026-07-10', 'skipped'), t('2026-07-11', 'completed')],
    TODAY,
  );
  assert.equal(a.dueCount, 1);
  assert.equal(a.completedDue, 1);
  assert.equal(a.status, 'on_track');
});

test('undated tasks are ignored', () => {
  const a = computeAdherence([t(null), t(null, 'completed')], TODAY);
  assert.equal(a.dueCount, 0);
  // An undated completed task is not "ahead" — it has no schedule at all.
  assert.equal(a.completedAhead, 0);
  assert.equal(a.status, 'not_started');
});
