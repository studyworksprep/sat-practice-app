// Unit tests for the deterministic study-plan generator (§2.2).
// Pinned properties a tutor relies on: right horizon, mastered/empty
// skills excluded, lessons before drills, tests near the end, and full
// determinism.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from './generate-plan.ts';

/** @returns {import('./generate-plan.ts').PlanInput} */
function fixture() {
  return {
    goalScore: 1400,
    startingScore: 1120,
    testDate: '2026-09-26', // 56 days after today → 8 weeks
    today: '2026-08-01',
    weeklyHours: 5,
    testType: 'sat',
    skills: [
      { domainCode: 'H', skillCode: 'H.A.', section: 'math', mastery: null, attemptsCount: 0,
        coverageStatus: 'not_started', masteryThreshold: 80, learnability: 8, expectedMinutes: 60,
        sequence: 1, questionsAvailable: 100, hasLesson: true },
      { domainCode: 'P', skillCode: 'P.C.', section: 'math', mastery: 90, attemptsCount: 70,
        coverageStatus: 'mastered', masteryThreshold: 80, learnability: 4, expectedMinutes: 60,
        sequence: 8, questionsAvailable: 236, hasLesson: true },
      { domainCode: 'Q', skillCode: 'Q.G.', section: 'math', mastery: 45, attemptsCount: 7,
        coverageStatus: 'in_progress', masteryThreshold: 80, learnability: 5, expectedMinutes: 60,
        sequence: 15, questionsAvailable: 11, hasLesson: false },
      { domainCode: 'CAS', skillCode: 'WIC', section: 'reading_writing', mastery: 60, attemptsCount: 20,
        coverageStatus: 'practiced', masteryThreshold: 80, learnability: 7, expectedMinutes: 45,
        sequence: 23, questionsAvailable: 242, hasLesson: false },
      { domainCode: 'SEC', skillCode: 'BOU', section: 'reading_writing', mastery: 55, attemptsCount: 40,
        coverageStatus: 'decayed', masteryThreshold: 80, learnability: 6, expectedMinutes: 45,
        sequence: 28, questionsAvailable: 189, hasLesson: true },
      // excluded: no published questions to practice
      { domainCode: 'S', skillCode: 'S.A.', section: 'math', mastery: null, attemptsCount: 0,
        coverageStatus: 'not_started', masteryThreshold: 80, learnability: 5, expectedMinutes: 60,
        sequence: 16, questionsAvailable: 0, hasLesson: false },
    ],
  };
}

const VALID_TYPES = new Set(['lesson', 'drill', 'review', 'practice_set', 'full_test', 'vocab', 'flashcards']);

test('horizon: 8 weeks between today and the test date', () => {
  const plan = generatePlan(fixture());
  assert.equal(plan.weeks, 8);
  assert.ok(plan.tasks.length > 0);
});

test('every task is well-formed and within the plan window', () => {
  const f = fixture();
  const plan = generatePlan(f);
  for (const t of plan.tasks) {
    assert.ok(VALID_TYPES.has(t.taskType), `bad type ${t.taskType}`);
    assert.ok(t.weekIndex >= 0 && t.weekIndex < plan.weeks);
    assert.equal(t.source, 'generated');
    assert.match(t.scheduledDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(t.scheduledDate >= f.today, `${t.scheduledDate} before today`);
  }
});

test('mastered and no-question skills are never scheduled', () => {
  const plan = generatePlan(fixture());
  const skills = plan.tasks.map((t) => t.payload.skill_code).filter(Boolean);
  assert.ok(!skills.includes('P.C.'), 'mastered skill scheduled');
  assert.ok(!skills.includes('S.A.'), 'skill with no questions scheduled');
});

test('a full practice test lands in the final week', () => {
  const plan = generatePlan(fixture());
  const finalTests = plan.tasks.filter((t) => t.taskType === 'full_test' && t.weekIndex === plan.weeks - 1);
  assert.ok(finalTests.length >= 1, 'no full_test in the final week');
});

test('spaced review appears from week 1 onward, never week 0', () => {
  const plan = generatePlan(fixture());
  const reviews = plan.tasks.filter((t) => t.taskType === 'review');
  assert.ok(reviews.length > 0);
  assert.ok(reviews.every((t) => t.weekIndex >= 1), 'review scheduled in week 0');
});

test('weak skills with a lesson get the lesson before any drill (H.A., BOU)', () => {
  const plan = generatePlan(fixture());
  for (const skill of ['H.A.', 'BOU']) {
    const forSkill = plan.tasks.filter((t) => t.payload.skill_code === skill);
    const lessons = forSkill.filter((t) => t.taskType === 'lesson');
    assert.equal(lessons.length, 1, `${skill}: expected exactly one lesson`);
    const firstIdx = plan.tasks.findIndex((t) => t.payload.skill_code === skill);
    assert.equal(plan.tasks[firstIdx].taskType, 'lesson', `${skill}: first task is not the lesson`);
  }
});

test('a drill carries a filter_criteria matching the practice runner shape', () => {
  const plan = generatePlan(fixture());
  const drill = plan.tasks.find((t) => t.taskType === 'drill');
  assert.ok(drill, 'no drill produced');
  const fc = drill.payload.filter_criteria;
  assert.ok(fc && fc.skill_code && fc.domain_code && typeof fc.count === 'number');
});

test('deterministic: identical input → identical output', () => {
  const a = generatePlan(fixture());
  const b = generatePlan(fixture());
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('no week exceeds the weekly task budget (5 hrs → 8 tasks/week)', () => {
  const plan = generatePlan(fixture());
  const perWeek = new Map();
  for (const t of plan.tasks) perWeek.set(t.weekIndex, (perWeek.get(t.weekIndex) ?? 0) + 1);
  for (const [, count] of perWeek) assert.ok(count <= 8, `week has ${count} tasks (> 8)`);
});
