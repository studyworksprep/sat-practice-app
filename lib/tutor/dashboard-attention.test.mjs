// Tutor dashboard: who needs attention, the count tiles, and the
// day-grouped recent-work feed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAttention, buildDashboardTiles, dashboardSummary, daysUntil } from './dashboard-attention.ts';
import { groupRecentWork } from './dashboard-activity.ts';

const NOW = Date.parse('2026-11-05T15:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();
const student = (over) => ({
  id: 'x', name: 'Stu X', lastActiveAt: daysAgo(1), hasPlan: true, planBehind: false,
  overdueTasks: 0, overdueAssignments: 0, openAssignments: 0, testDate: null, latestScore: null, goalScore: 1400,
  ...over,
});

test('only problems put a student on the list; on-track students stay off', () => {
  const rows = buildAttention([
    student({ id: 'ok', name: 'On Track' }),
    student({ id: 'noplan', name: 'No Plan', hasPlan: false }),
    student({ id: 'soon', name: 'Test Soon', testDate: '2026-11-20' }),
  ], NOW);
  assert.deepEqual(rows, [], 'a missing plan or a near test alone is context, not a problem');
});

test('behind plans, overdue work and idle weeks each list a student, with reasons', () => {
  const rows = buildAttention([
    student({ id: 'a', name: 'Behind', planBehind: true, overdueTasks: 98 }),
    student({ id: 'b', name: 'Overdue', overdueAssignments: 2, lastActiveAt: daysAgo(12), hasPlan: false }),
    student({ id: 'c', name: 'Idle', lastActiveAt: null }),
  ], NOW);
  assert.deepEqual(rows.map((r) => r.student.id), ['b', 'a', 'c'], 'two problems outrank one');
  assert.deepEqual(rows[0].reasons.map((r) => r.label), ['2 assignments overdue', 'No practice in 12 days', 'No study plan']);
  assert.deepEqual(rows[1].reasons.map((r) => r.label), ['98 plan tasks overdue']);
  assert.deepEqual(rows[2].reasons.map((r) => r.label), ['No practice in 60+ days']);
});

test('a near test is added as context and raises urgency', () => {
  const rows = buildAttention([
    student({ id: 'far', name: 'A Far', overdueAssignments: 1 }),
    student({ id: 'near', name: 'B Near', overdueAssignments: 1, testDate: '2026-11-15' }),
  ], NOW);
  assert.equal(rows[0].student.id, 'near');
  assert.deepEqual(rows[0].reasons.map((r) => r.label), ['1 assignment overdue', 'Test in 10 days']);
});

test('six days without practice is fine; seven is a problem', () => {
  assert.equal(buildAttention([student({ lastActiveAt: daysAgo(6) })], NOW).length, 0);
  assert.equal(buildAttention([student({ lastActiveAt: daysAgo(7) })], NOW).length, 1);
});

test('tiles count practiced, behind, late and tests within 30 days', () => {
  const tiles = buildDashboardTiles([
    student({ id: 'a', planBehind: true, testDate: '2026-11-30' }),
    student({ id: 'b', lastActiveAt: daysAgo(9), testDate: '2026-12-31' }),
    student({ id: 'c', lastActiveAt: null, testDate: '2026-10-01' }),
  ], 7, NOW);
  assert.deepEqual(tiles, { total: 3, practicedThisWeek: 1, behind: 1, lateAssignments: 7, testsSoon: 1 });
  assert.equal(daysUntil('2026-11-05', NOW), 0);
});

test('the header summary', () => {
  assert.equal(dashboardSummary(0, 0), 'No students assigned yet.');
  assert.equal(dashboardSummary(3, 0), '3 students on your roster. Everyone is on track this week.');
  assert.equal(dashboardSummary(3, 1), '3 students on your roster. One needs you this week.');
  assert.equal(dashboardSummary(3, 2), '3 students on your roster. 2 need you this week.');
  assert.equal(dashboardSummary(3, 3), '3 students on your roster. All of them need you this week.');
  assert.equal(dashboardSummary(1, 1), '1 student on your roster. One needs you this week.');
  assert.equal(dashboardSummary(4, null), '4 students on your roster.');
});

const act = (over) => ({
  id: over.id, studentId: 's1', kind: 'practice', title: 'SAT practice', status: 'Completed',
  detail: '10-question set', at: over.at, href: `/tutor/sessions/${over.id}`, action: 'Review work',
  questionCount: 10, open: false, ...over,
});
const dayOf = (iso) => iso.slice(0, 10);

test('recent work folds one student\'s practice sets per day; assignments and tests stay single', () => {
  const days = groupRecentWork([
    act({ id: 'p1', at: '2026-11-05T14:00:00Z' }),
    act({ id: 'p2', at: '2026-11-05T13:00:00Z', open: true, status: 'In progress', questionCount: 5 }),
    act({ id: 'p3', at: '2026-11-05T12:00:00Z' }),
    act({ id: 'a1', at: '2026-11-05T13:30:00Z', kind: 'assignment', title: 'Words in Context' }),
    act({ id: 'o1', at: '2026-11-05T11:00:00Z', studentId: 's2' }),
    act({ id: 'p4', at: '2026-11-04T10:00:00Z' }),
  ], dayOf);
  assert.deepEqual(days.map((d) => d.day), ['2026-11-05', '2026-11-04']);
  const today = days[0].rows;
  assert.deepEqual(today.map((r) => r.id), ['practice-day:s1:2026-11-05', 'a1', 'o1']);
  assert.equal(today[0].title, '3 practice sets');
  assert.equal(today[0].status, '2 finished, 1 still open');
  assert.equal(today[0].detail, '25 questions in all');
  assert.equal(today[0].href, '/tutor/students/s1');
  assert.equal(today[0].sets, 3);
  assert.equal(today[2].title, 'SAT practice', 'a single set keeps its own row and link');
  assert.equal(today[2].href, '/tutor/sessions/o1');
  assert.equal(days[1].rows[0].id, 'p4');
});
