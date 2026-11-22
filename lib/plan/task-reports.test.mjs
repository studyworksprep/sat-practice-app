import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordedTaskReport, assignedTaskReports } from './task-reports.ts';

const id = 'cd9f51ac-becc-499a-b132-07d31a566798';

test('completed practice and tests link to the recorded result only', () => {
  for (const type of ['drill', 'review', 'practice_set'])
    assert.equal(recordedTaskReport(type, 'completed', id), `/practice/review/${id}`);
  assert.equal(recordedTaskReport('full_test', 'completed', id), `/practice/test/attempt/${id}/results`);
  for (const value of [null, 'manual', `lesson:${id}`, `assignment:${id}`])
    assert.equal(recordedTaskReport('drill', 'completed', value), undefined);
  assert.equal(recordedTaskReport('lesson', 'completed', id), undefined);
  assert.equal(recordedTaskReport('review', 'skipped', id), undefined);
});

test('a plan without completed report-bearing assignments needs no report lookup', async () => {
  const db = { from() { throw Error('unexpected query'); } };
  assert.equal((await assignedTaskReports(db, 'student', [])).size, 0);
  assert.equal((await assignedTaskReports(db, 'student', [{ id, assignment_type: 'lesson' }])).size, 0);
});
