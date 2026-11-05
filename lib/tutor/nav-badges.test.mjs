// Tutor sidebar counts: "N behind" on Roster, "N late" on Assignments.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTutorNavBadges,
  countBehindStudents,
  countLateAssignments,
  isLateAssignment,
} from './nav-badges.ts';

const TODAY = '2026-11-04';
const NOW = new Date(2026, 10, 4, 12).getTime(); // Nov 4, local noon

const task = (scheduled_date, status) => ({ scheduled_date, status });
const behindPlan = (student_id) => ({
  student_id,
  plan_tasks: [task('2026-11-01', 'pending'), task('2026-11-02', 'pending'), task('2026-11-03', 'completed')],
});
const onTrackPlan = (student_id) => ({
  student_id,
  plan_tasks: [task('2026-11-01', 'completed'), task('2026-11-02', 'completed')],
});

test('counts active students whose plan is behind', () => {
  const plans = [behindPlan('a'), behindPlan('b'), onTrackPlan('c')];
  assert.equal(countBehindStudents(plans, new Set(['a', 'b', 'c']), TODAY), 2);
});

test('archived students are not counted as behind', () => {
  const plans = [behindPlan('a'), behindPlan('gone')];
  assert.equal(countBehindStudents(plans, new Set(['a']), TODAY), 1);
});

test('a student with two plan rows counts once', () => {
  assert.equal(countBehindStudents([behindPlan('a'), behindPlan('a')], new Set(['a']), TODAY), 1);
});

const assignment = (over) => ({
  due_date: '2026-11-01',
  archived_at: null,
  assignment_students_v2: [{ completed_at: null }],
  ...over,
});

test('past due with an unfinished student is late', () => {
  assert.equal(isLateAssignment(assignment({}), NOW), true);
});

test('everyone finished means not late, even past due', () => {
  const row = assignment({ assignment_students_v2: [{ completed_at: '2026-11-02T10:00:00Z' }] });
  assert.equal(isLateAssignment(row, NOW), false);
});

test('due today is not late yet; archived and undated never are', () => {
  assert.equal(isLateAssignment(assignment({ due_date: TODAY }), NOW), false);
  assert.equal(isLateAssignment(assignment({ archived_at: '2026-11-03T00:00:00Z' }), NOW), false);
  assert.equal(isLateAssignment(assignment({ due_date: null }), NOW), false);
  assert.equal(isLateAssignment(assignment({ assignment_students_v2: [] }), NOW), false);
});

test('countLateAssignments counts only late rows', () => {
  const rows = [assignment({}), assignment({}), assignment({ due_date: '2026-12-01' })];
  assert.equal(countLateAssignments(rows, NOW), 2);
});

test('badges appear only for non-zero counts', () => {
  assert.deepEqual(buildTutorNavBadges({ behind: 0, late: 0 }), {});
  assert.deepEqual(buildTutorNavBadges({ behind: 2, late: 7 }), {
    '/tutor/roster': { label: '2 behind', tone: 'neutral' },
    '/tutor/assignments': { label: '7 late', tone: 'alert' },
  });
});
