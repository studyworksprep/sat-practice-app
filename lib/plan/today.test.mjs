// Selection-policy tests for the Today view model (§2.3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTodayView, taskTitle, MAX_TODAY_TASKS } from './today.ts';

let seq = 0;
function task(over = {}) {
  seq += 1;
  return {
    id: `t-${seq}`,
    weekIndex: 0,
    scheduledDate: '2026-07-15',
    taskType: 'drill',
    payload: {},
    status: 'pending',
    completedAt: null,
    source: 'generated',
    ...over,
  };
}

const TODAY = '2026-07-15';

test('due: pending tasks scheduled today or earlier, oldest first, capped', () => {
  const view = buildTodayView(
    [
      task({ scheduledDate: '2026-07-15' }),
      task({ scheduledDate: '2026-07-13' }), // overdue → first
      task({ scheduledDate: '2026-07-14' }),
      task({ scheduledDate: '2026-07-15' }),
      task({ scheduledDate: '2026-07-16' }), // future → not due
    ],
    TODAY,
    null,
  );
  assert.equal(view.due.length, MAX_TODAY_TASKS);
  assert.deepEqual(
    view.due.map((t) => t.scheduledDate),
    ['2026-07-13', '2026-07-14', '2026-07-15'],
  );
});

test('undated tasks (tutor quick-adds) are due immediately, ahead of dated work', () => {
  const view = buildTodayView(
    [task({ scheduledDate: '2026-07-14' }), task({ scheduledDate: null })],
    TODAY,
    null,
  );
  assert.equal(view.due[0].scheduledDate, null);
});

test('tasks finished today consume today\'s slots and appear as doneToday', () => {
  const view = buildTodayView(
    [
      task({ status: 'completed', completedAt: '2026-07-15T09:00:00Z' }),
      task({ status: 'completed', completedAt: '2026-07-15T10:00:00Z' }),
      task({ scheduledDate: '2026-07-15' }),
      task({ scheduledDate: '2026-07-15' }),
    ],
    TODAY,
    null,
  );
  assert.equal(view.doneToday.length, 2);
  // 3-task day, 2 already done → only 1 more offered.
  assert.equal(view.due.length, 1);
});

test('tasks completed on earlier days neither block slots nor show as doneToday', () => {
  const view = buildTodayView(
    [
      task({ status: 'completed', completedAt: '2026-07-14T09:00:00Z' }),
      task({ scheduledDate: '2026-07-15' }),
    ],
    TODAY,
    null,
  );
  assert.equal(view.doneToday.length, 0);
  assert.equal(view.due.length, 1);
});

test('skipped tasks are never due', () => {
  const view = buildTodayView(
    [task({ status: 'skipped' }), task({ scheduledDate: '2026-07-15' })],
    TODAY,
    null,
  );
  assert.equal(view.due.length, 1);
});

test('upNext is the earliest pending task after today', () => {
  const view = buildTodayView(
    [
      task({ scheduledDate: '2026-07-15' }),
      task({ scheduledDate: '2026-07-19', payload: { title: 'later' } }),
      task({ scheduledDate: '2026-07-17', payload: { title: 'sooner' } }),
    ],
    TODAY,
    null,
  );
  assert.equal(view.upNext?.payload.title, 'sooner');
});

test('week progress anchors week 0 at the earliest scheduled date', () => {
  const view = buildTodayView(
    [
      // Week 0 = Jul 8–14; today (Jul 15) is in week 1.
      task({ weekIndex: 0, scheduledDate: '2026-07-08', status: 'completed', completedAt: '2026-07-08T12:00:00Z' }),
      task({ weekIndex: 0, scheduledDate: '2026-07-10', status: 'completed', completedAt: '2026-07-10T12:00:00Z' }),
      task({ weekIndex: 1, scheduledDate: '2026-07-15' }),
      task({ weekIndex: 1, scheduledDate: '2026-07-18', status: 'completed', completedAt: '2026-07-14T12:00:00Z' }),
      task({ weekIndex: 2, scheduledDate: '2026-07-22' }),
    ],
    TODAY,
    null,
  );
  assert.deepEqual(view.week, { index: 1, total: 3, done: 1, count: 2 });
});

test('week index clamps to the plan\'s declared range', () => {
  const view = buildTodayView(
    [task({ weekIndex: 0, scheduledDate: '2026-01-01' })], // months ago
    TODAY,
    null,
  );
  assert.equal(view.week?.index, 0);
});

test('daysToTest and planFinished', () => {
  const finished = buildTodayView(
    [task({ status: 'completed', completedAt: '2026-07-01T00:00:00Z' })],
    TODAY,
    '2026-07-25',
  );
  assert.equal(finished.daysToTest, 10);
  assert.equal(finished.planFinished, true);
  assert.equal(buildTodayView([], TODAY, null).planFinished, false);
});

test('taskTitle prefers payload.title, falls back by type', () => {
  assert.equal(taskTitle(task({ payload: { title: 'Drill: H.A.' } })), 'Drill: H.A.');
  assert.equal(taskTitle(task({ taskType: 'full_test', payload: {} })), 'Full-length practice test');
  assert.equal(taskTitle(task({ taskType: 'review', payload: { title: '  ' } })), 'Spaced review');
});
