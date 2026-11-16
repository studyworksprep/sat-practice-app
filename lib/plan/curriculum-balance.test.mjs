import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from './generate-plan.ts';

const skills = Array.from({ length: 29 }, (_, i) => ({
  domainCode: 'H', skillCode: `skill-${i}`, section: 'math', mastery: null, attemptsCount: 0,
  coverageStatus: 'not_started', masteryThreshold: 80, learnability: 7, expectedMinutes: 40,
  sequence: i, questionsAvailable: 100, hasLesson: true,
}));
const base = { goalScore: 1400, startingScore: 1000, testDate: '2027-03-15', today: '2026-11-16', weeklyHours: 5, testType: 'sat', skills };
for (const mode of ['targeted', 'foundations', 'self_directed']) {
  for (const syllabus of [false, true]) {
    test(`${mode}, syllabi ${syllabus}: lessons, immediate practice, and cumulative sets throughout`, () => {
      const plan = generatePlan({ ...base, mode, targets: skills.map((s) => s.skillCode),
        ...(syllabus ? { unitSteps: Object.fromEntries(skills.map((s) => [s.skillCode, [
          { id: `${s.skillCode}-lesson`, position: 1, kind: 'lesson', lessonId: s.skillCode },
          { id: `${s.skillCode}-practice`, position: 2, kind: 'drill', role: 'practice' },
        ]])) } : {}),
      });
      const learning = plan.tasks.filter((t) => t.taskType === 'lesson' || t.taskType === 'drill');
      for (let i = 0; i < learning.length; i++) {
        if (learning[i].taskType !== 'lesson') continue;
        assert.equal(learning[i + 1]?.taskType, 'drill');
        assert.equal(learning[i + 1]?.payload.skill_code, learning[i].payload.skill_code);
      }
      for (let w = 0; w < plan.weeks; w++) {
        const week = plan.tasks.filter((t) => t.weekIndex === w);
        assert.ok(week.some((t) => t.taskType === 'drill'), `week ${w + 1} has no practice`);
        assert.ok(week.some((t) => t.taskType === 'practice_set' && t.payload.drill_role === 'mixed'), `week ${w + 1} has no mixed review`);
      }
      const introduced = new Set();
      for (const t of plan.tasks) {
        if (t.payload.skill_code) introduced.add(t.payload.skill_code);
        if (t.taskType === 'practice_set') for (const code of t.payload.filter_criteria.skill_codes) assert.ok(introduced.has(code));
      }
    });
  }
}
test('lesson-only outlines still generate application practice between lessons', () => {
  const plan = generatePlan({ ...base, mode: 'targeted', skills: skills.slice(0, 1), unitSteps: { 'skill-0': [
    { position: 1, kind: 'lesson', lessonId: 'one' }, { position: 2, kind: 'lesson', lessonId: 'two' },
  ] } });
  assert.deepEqual(plan.tasks.filter((t) => ['lesson', 'drill'].includes(t.taskType)).slice(0, 4).map((t) => t.taskType), ['lesson', 'drill', 'lesson', 'drill']);
});
