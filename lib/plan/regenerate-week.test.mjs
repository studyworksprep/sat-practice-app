// Single-week regeneration tests (§2.4 editor).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  regenerateWeekTasks,
  survivesWeekRegeneration,
  buildDrillPayload,
  buildLessonPayload,
  generatePlan,
} from './generate-plan.ts';

function skill(over = {}) {
  return {
    domainCode: 'H',
    skillCode: 'H.A',
    section: 'math',
    mastery: 40,
    attemptsCount: 10,
    coverageStatus: 'in_progress',
    masteryThreshold: 80,
    learnability: 7,
    expectedMinutes: 60,
    sequence: 1,
    questionsAvailable: 50,
    hasLesson: false,
    ...over,
  };
}

const SKILLS = [
  skill(),
  skill({ skillCode: 'H.B', sequence: 2 }),
  skill({ domainCode: 'P', skillCode: 'P.A', sequence: 3 }),
  skill({ domainCode: 'CAS', skillCode: 'CAS.A', section: 'reading_writing', sequence: 4 }),
];

const BASE = {
  planStart: '2026-07-06',
  testDate: '2026-08-31',
  goalScore: 1400,
  startingScore: 1220,
  weeklyHours: 5,
  testType: 'sat',
  skills: SKILLS,
};

test('returns tasks only for the target week, on the original grid', () => {
  const out = regenerateWeekTasks({ ...BASE, weekIndex: 2, existingTasks: [] });
  assert.ok(out.length > 0);
  for (const t of out) {
    assert.equal(t.weekIndex, 2);
    assert.equal(t.source, 'generated');
    // Week 2 of a plan anchored 2026-07-06 spans 07-20 .. 07-26.
    assert.ok(t.scheduledDate >= '2026-07-20' && t.scheduledDate <= '2026-07-26');
  }
});

test('matches what the full generator would emit for that week', () => {
  const full = generatePlan({
    ...BASE,
    today: BASE.planStart,
  });
  const wk1 = full.tasks.filter((t) => t.weekIndex === 1);
  const out = regenerateWeekTasks({ ...BASE, weekIndex: 1, existingTasks: [] });
  assert.deepEqual(out, wk1);
});

test('skills covered by surviving tasks in the week are not duplicated', () => {
  const tutorTask = {
    weekIndex: 1,
    scheduledDate: '2026-07-14',
    taskType: 'drill',
    payload: buildDrillPayload({ domainCode: 'H', skillCode: 'H.A' }, 'tutor says so'),
    source: 'tutor',
    status: 'pending',
  };
  const out = regenerateWeekTasks({ ...BASE, weekIndex: 1, existingTasks: [tutorTask] });
  const codes = out.map((t) => t.payload.skill_code).filter(Boolean);
  assert.ok(!codes.includes('H.A'), 'tutor-owned skill must not be regenerated');
});

test('completed generated tasks survive; pending generated ones do not', () => {
  const done = { weekIndex: 0, scheduledDate: '2026-07-06', taskType: 'drill', payload: {}, source: 'generated', status: 'completed' };
  const open = { ...done, status: 'pending' };
  const tutor = { ...open, source: 'tutor' };
  const skipped = { ...done, status: 'skipped' };
  assert.equal(survivesWeekRegeneration(done), true);
  assert.equal(survivesWeekRegeneration(open), false);
  assert.equal(survivesWeekRegeneration(tutor), true);
  assert.equal(survivesWeekRegeneration(skipped), true);
});

test('payload builders produce the runner-compatible shapes', () => {
  const drill = buildDrillPayload({ domainCode: 'H', skillCode: 'H.A', expectedMinutes: 90 }, 'why');
  assert.equal(drill.title, 'Drill: H/H.A');
  assert.deepEqual(drill.filter_criteria, { domain_code: 'H', skill_code: 'H.A', count: 8 });
  assert.equal(drill.minutes, 40); // capped at AVG_TASK_MINUTES

  const lesson = buildLessonPayload({ domainCode: 'H', skillCode: 'H.A', expectedMinutes: 90 }, 'why');
  assert.equal(lesson.title, 'Lesson: H/H.A');
  assert.equal(lesson.minutes, 90); // lessons keep their expected length
  assert.equal(lesson.filter_criteria, undefined);
});
