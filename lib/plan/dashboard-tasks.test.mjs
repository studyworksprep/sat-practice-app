import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardTutorNames, dashboardTasks } from './dashboard-tasks.ts';

test('each assignment uses its own tutor, and a mirrored assignment appears once', () => {
  const cards = ['Julio Machado', 'Arielle Smith'].map((name) => {
    const [first_name, last_name] = name.split(' ');
    return { id: first_name, first_name, last_name, tutor_name: name };
  });
  const names = dashboardTutorNames(cards);
  const assignments = cards.map((c, i) => ({
    id: c.id,
    title: c.id,
    teacher_id: c.id,
    student_completed_at: null,
    due_date: i ? '2026-11-24' : '2026-11-22',
  }));
  const plan = [
    {
      id: 'mirrored',
      status: 'pending',
      weekIndex: 1,
      scheduledDate: '2026-11-24',
      payload: { assignment_id: 'Arielle' },
      taskType: 'drill',
    },
  ];
  const agenda = dashboardTasks(plan, assignments, names, '2026-11-22');
  assert.equal(agenda.hero.byline, 'Assigned by Julio');
  assert.equal(agenda.hero.outsidePlan, true);
  assert.deepEqual(
    agenda.ahead.map((t) => t.byline),
    ['Assigned by Arielle'],
  );
  assert.deepEqual(
    dashboardTasks([], assignments, new Map(), '2026-11-22').due.map((t) => t.byline),
    ['Tutor assignment'],
  );
});

test('shared first names use full attribution and preferred display names are honored', () => {
  const cards = [
    ['1', 'Alex', 'Gray', null],
    ['2', 'Alex', 'Green', null],
    ['3', 'Alex', 'Cruz', 'Ms. Cruz'],
  ].map(([id, first_name, last_name, tutor_name]) => ({ id, first_name, last_name, tutor_name }));
  assert.deepEqual(
    [...dashboardTutorNames(cards).values()].map((t) => t.byline),
    ['Alex Gray', 'Alex Green', 'Ms. Cruz'],
  );
});
