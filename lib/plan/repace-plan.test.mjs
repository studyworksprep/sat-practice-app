// Unit tests for the deterministic re-pacer (§2.5). Pinned properties:
// on-track plans are left alone, drift past threshold regenerates the
// remaining horizon, tutor edits survive (and aren't double-scheduled),
// stale/finished tasks are dropped, and the whole thing is deterministic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repacePlan } from './generate-plan.ts';

/** @returns {import('./generate-plan.ts').SkillState[]} */
function skills() {
  return [
    // Weak + practicable — the generator WOULD schedule this unless a
    // tutor task already owns it (the preservation test relies on that).
    { domainCode: 'H', skillCode: 'H.A.', section: 'math', mastery: 30, attemptsCount: 5,
      coverageStatus: 'in_progress', masteryThreshold: 80, learnability: 8, expectedMinutes: 60,
      sequence: 1, questionsAvailable: 100, hasLesson: true },
    { domainCode: 'Q', skillCode: 'Q.G.', section: 'math', mastery: 45, attemptsCount: 7,
      coverageStatus: 'in_progress', masteryThreshold: 80, learnability: 5, expectedMinutes: 60,
      sequence: 15, questionsAvailable: 40, hasLesson: false },
    { domainCode: 'CAS', skillCode: 'WIC', section: 'reading_writing', mastery: 55, attemptsCount: 20,
      coverageStatus: 'practiced', masteryThreshold: 80, learnability: 7, expectedMinutes: 45,
      sequence: 23, questionsAvailable: 200, hasLesson: false },
  ];
}

/** @returns {import('./generate-plan.ts').ExistingTask[]} */
function existingTasks() {
  return [
    // Preserved: hand-authored, open, future.
    { weekIndex: 2, scheduledDate: '2026-08-10', taskType: 'lesson',
      payload: { skill_code: 'H.A.', domain_code: 'H', title: 'Tutor: 1:1 on linear systems' },
      source: 'tutor', status: 'pending' },
    // Dropped: already completed.
    { weekIndex: 1, scheduledDate: '2026-08-05', taskType: 'drill',
      payload: { skill_code: 'Q.G.' }, source: 'tutor', status: 'completed' },
    // Dropped: overdue (before today).
    { weekIndex: 0, scheduledDate: '2026-07-01', taskType: 'drill',
      payload: { skill_code: 'WIC' }, source: 'tutor', status: 'pending' },
    // Dropped: not a tutor task.
    { weekIndex: 3, scheduledDate: '2026-08-20', taskType: 'drill',
      payload: { skill_code: 'Q.G.' }, source: 'generated', status: 'pending' },
  ];
}

/** @returns {import('./generate-plan.ts').RepaceInput} */
function fixture(currentScore) {
  return {
    today: '2026-08-01',
    planStart: '2026-06-01',
    testDate: '2026-09-26', // span 117 days; elapsed 61 → expected ≈ 1266
    startingScore: 1120,
    goalScore: 1400,
    currentScore,
    weeklyHours: 5,
    testType: 'sat',
    skills: skills(),
    existingTasks: existingTasks(),
  };
}

test('on-track plan is left untouched (no re-pace)', () => {
  const r = repacePlan(fixture(1260)); // expected ≈1266 → drift ≈6
  assert.equal(r.shouldRepace, false);
  assert.equal(r.tasks, null);
  assert.ok(Math.abs(r.driftPoints) < 40);
});

test('falling behind past threshold triggers a re-pace', () => {
  const r = repacePlan(fixture(1180)); // drift ≈ +86
  assert.equal(r.shouldRepace, true);
  assert.ok(r.driftPoints > 40);
  assert.ok(Array.isArray(r.tasks) && r.tasks.length > 0);
  assert.match(r.reason, /behind/);
});

test('running ahead past threshold also re-paces (lighter plan)', () => {
  const r = repacePlan(fixture(1340)); // drift ≈ -74
  assert.equal(r.shouldRepace, true);
  assert.ok(r.driftPoints < -40);
  assert.match(r.reason, /ahead/);
});

test('regenerated tasks stay within [today, testDate]', () => {
  const f = fixture(1180);
  const r = repacePlan(f);
  for (const t of r.tasks) {
    assert.ok(t.scheduledDate >= f.today, `${t.scheduledDate} before today`);
    assert.ok(t.scheduledDate <= f.testDate, `${t.scheduledDate} after test date`);
    assert.ok(t.weekIndex >= 0 && t.weekIndex < r.weeks);
  }
});

test('open future tutor task is preserved with source=tutor', () => {
  const r = repacePlan(fixture(1180));
  const preserved = r.tasks.filter((t) => t.source === 'tutor');
  assert.equal(preserved.length, 1);
  assert.equal(preserved[0].payload.skill_code, 'H.A.');
  assert.equal(preserved[0].scheduledDate, '2026-08-10');
});

test('a tutor-owned skill is not also scheduled by the generator', () => {
  const r = repacePlan(fixture(1180));
  const generatedHA = r.tasks.filter(
    (t) => t.source === 'generated' && t.payload.skill_code === 'H.A.',
  );
  assert.equal(generatedHA.length, 0, 'generator double-scheduled a tutor-owned skill');
});

test('completed, overdue, and non-tutor tasks are dropped', () => {
  const r = repacePlan(fixture(1180));
  const tutor = r.tasks.filter((t) => t.source === 'tutor');
  // Only the single open/future tutor task survives.
  assert.equal(tutor.length, 1);
  assert.ok(!tutor.some((t) => t.scheduledDate === '2026-07-01'), 'overdue task resurrected');
});

test('test date in the past → no re-pace', () => {
  const f = fixture(1180);
  f.today = '2026-10-01'; // after testDate
  const r = repacePlan(f);
  assert.equal(r.shouldRepace, false);
  assert.match(r.reason, /passed/);
});

test('missing baseline or current score → no re-pace', () => {
  assert.equal(repacePlan(fixture(null)).shouldRepace, false);
  const f = fixture(1180);
  f.startingScore = null;
  assert.equal(repacePlan(f).shouldRepace, false);
});

test('deterministic: identical input → identical output', () => {
  assert.equal(JSON.stringify(repacePlan(fixture(1180))), JSON.stringify(repacePlan(fixture(1180))));
});
