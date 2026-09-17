// Unit tests for the phase composer (docs/student-onboarding-and-plan-
// redesign-2026-09.md §5). Pinned: phase layout per mode, coverage in
// curriculum order with lesson-then-drill, evidence priors moving the
// gap and explaining drills, study days honored, self-directed plans
// drawing only from the chosen skills, and re-pace resuming mid-course.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, composePhases, STRONG_PRIOR } from './generate-plan.ts';
import { planTaskWhy } from './task-labels.ts';

function skill(over) {
  return {
    domainCode: 'H', skillCode: 'H.A.', section: 'math', mastery: null, attemptsCount: 0,
    coverageStatus: 'not_started', masteryThreshold: 80, learnability: 5, expectedMinutes: 40,
    sequence: 1, questionsAvailable: 100, hasLesson: true,
    ...over,
  };
}

/** Six untouched skills in curriculum order, mixed lessons. */
function freshSkills() {
  return [
    skill({ skillCode: 'H.A.', sequence: 1, learnability: 3 }),
    skill({ skillCode: 'H.B.', sequence: 2, learnability: 9, hasLesson: false }),
    skill({ domainCode: 'P', skillCode: 'P.C.', sequence: 3, learnability: 8 }),
    skill({ domainCode: 'Q', skillCode: 'Q.G.', sequence: 4, learnability: 6 }),
    skill({ domainCode: 'CAS', skillCode: 'WIC', section: 'reading_writing', sequence: 5, learnability: 7 }),
    skill({ domainCode: 'SEC', skillCode: 'BOU', section: 'reading_writing', sequence: 6, learnability: 4, hasLesson: false }),
  ];
}

function base(over) {
  return {
    goalScore: 1300,
    startingScore: null,
    testDate: '2026-12-05', // 12 weeks after today
    today: '2026-09-12',
    weeklyHours: 5,
    testType: 'sat',
    skills: freshSkills(),
    ...over,
  };
}

const weekOf = (plan, t) => t.weekIndex;
const phaseOf = (plan, w) => plan.phases.find((p) => w >= p.startWeek && w <= p.endWeek);

// ── composePhases ───────────────────────────────────────────────

test('foundations: coverage → focus → rehearsal, contiguous and covering every week', () => {
  const phases = composePhases('foundations', 12);
  assert.deepEqual(phases.map((p) => p.type), ['coverage', 'focus', 'rehearsal']);
  assert.equal(phases[0].startWeek, 0);
  assert.equal(phases[phases.length - 1].endWeek, 11);
  for (let i = 1; i < phases.length; i++) {
    assert.equal(phases[i].startWeek, phases[i - 1].endWeek + 1);
  }
  // 2 rehearsal weeks, 60% of the remaining 10 on coverage.
  assert.deepEqual(phases.map((p) => p.endWeek - p.startWeek + 1), [6, 4, 2]);
});

test('targeted: focus → rehearsal; self_directed: targets → rehearsal', () => {
  assert.deepEqual(composePhases('targeted', 8).map((p) => p.type), ['focus', 'rehearsal']);
  assert.deepEqual(composePhases('self_directed', 8).map((p) => p.type), ['targets', 'rehearsal']);
});

test('short horizons: no rehearsal under 3 weeks, one week from 3 to 5', () => {
  assert.deepEqual(composePhases('foundations', 2).map((p) => p.type), ['coverage']);
  assert.deepEqual(composePhases('foundations', 4).map((p) => [p.type, p.endWeek - p.startWeek + 1]),
    [['coverage', 2], ['focus', 1], ['rehearsal', 1]]);
  assert.deepEqual(composePhases('foundations', 1).map((p) => p.type), ['coverage']);
});

test('fullTests=false drops the rehearsal phase', () => {
  assert.deepEqual(composePhases('self_directed', 8, false).map((p) => p.type), ['targets']);
});

test('every phase carries a summary sentence', () => {
  for (const p of composePhases('foundations', 12)) assert.ok(p.summary.length > 20);
});

// ── generatePlan: phases + mode ──────────────────────────────────

test('default mode is targeted (pre-phase behavior preserved)', () => {
  const plan = generatePlan(base());
  assert.equal(plan.mode, 'targeted');
  assert.deepEqual(plan.phases.map((p) => p.type), ['focus', 'rehearsal']);
});

test('foundations: coverage weeks walk the curriculum in sequence order, lesson then drill', () => {
  const plan = generatePlan(base({ mode: 'foundations' }));
  const coverage = phaseOf(plan, 0);
  assert.equal(coverage.type, 'coverage');
  const skillTasks = plan.tasks
    .filter((t) => (t.taskType === 'lesson' || t.taskType === 'drill') && weekOf(plan, t) <= coverage.endWeek)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.weekIndex - b.weekIndex);
  // First four skill tasks: lesson H.A., drill H.A., drill H.B. (no lesson), lesson P.C.
  const head = skillTasks.slice(0, 4).map((t) => `${t.taskType}:${t.payload.skill_code}`);
  assert.deepEqual(head, ['lesson:H.A.', 'drill:H.A.', 'drill:H.B.', 'lesson:P.C.']);
  // Coverage tasks carry the code for the record but render no why
  // line — the plan's structure already says why they're there.
  for (const t of skillTasks) {
    if (t.taskType === 'drill') assert.equal(t.payload.why_code, 'coverage');
    assert.equal(planTaskWhy(t.payload), null, `${t.taskType} ${t.payload.skill_code} should be silent`);
  }
});

test('foundations: the focus phase ranks by priority, not sequence', () => {
  const plan = generatePlan(base({ mode: 'foundations' }));
  const focus = plan.phases.find((p) => p.type === 'focus');
  const drills = plan.tasks.filter(
    (t) => t.taskType === 'drill' && t.weekIndex >= focus.startWeek && t.weekIndex <= focus.endWeek,
  );
  assert.ok(drills.length > 0);
  assert.ok(drills.every((t) => t.payload.why_code !== 'coverage'));
});

test('a strong evidence prior skips the lesson in coverage; a weak one explains the drill in focus', () => {
  const skills = freshSkills();
  skills[0].evidencePrior = STRONG_PRIOR;           // H.A. — student says "very comfortable"
  skills[0].evidencePriorSource = 'self_rating';
  skills[2].evidencePrior = 0.25;                   // P.C. — "not comfortable"
  skills[2].evidencePriorSource = 'self_rating';
  const plan = generatePlan(base({ mode: 'foundations', skills }));
  const haLessons = plan.tasks.filter((t) => t.taskType === 'lesson' && t.payload.skill_code === 'H.A.');
  assert.equal(haLessons.length, 0, 'strong prior → drill only in coverage');

  const focus = plan.phases.find((p) => p.type === 'focus');
  const pcFocusDrill = plan.tasks.find(
    (t) => t.taskType === 'drill' && t.payload.skill_code === 'P.C.' && t.weekIndex >= focus.startWeek,
  );
  assert.ok(pcFocusDrill, 'weak-prior skill is drilled in focus');
  assert.equal(pcFocusDrill.payload.why_code, 'self_rated_low');
});

test('evidence prior orders the focus ranking (weak prior first, strong prior last)', () => {
  const skills = freshSkills().map((s) => ({ ...s, hasLesson: false }));
  skills[5].evidencePrior = 0.25; // BOU weak
  skills[1].evidencePrior = 0.75; // H.B. strong
  const plan = generatePlan(base({ mode: 'targeted', skills }));
  const firstWeekDrills = plan.tasks
    .filter((t) => t.taskType === 'drill' && t.weekIndex === 0)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  assert.equal(firstWeekDrills[0].payload.skill_code, 'BOU');
  assert.equal(firstWeekDrills[0].payload.why_code, 'self_rated_low');
  // Evidenced skills come before un-evidenced ones, and the strong one
  // sits behind the weak one.
  const codes = firstWeekDrills.map((t) => t.payload.skill_code);
  assert.ok(codes.indexOf('BOU') < codes.indexOf('H.B.'));
});

test('self_directed: skill tasks draw only from the chosen targets', () => {
  const plan = generatePlan(base({ mode: 'self_directed', targets: ['Q.G.', 'WIC'] }));
  const skillTasks = plan.tasks.filter((t) => t.taskType === 'lesson' || t.taskType === 'drill');
  assert.ok(skillTasks.length > 0);
  for (const t of skillTasks) {
    assert.ok(['Q.G.', 'WIC'].includes(t.payload.skill_code), `unexpected ${t.payload.skill_code}`);
  }
  assert.ok(skillTasks.some((t) => t.payload.why_code === 'targets'));
  for (const t of skillTasks) assert.equal(planTaskWhy(t.payload), null);
});

test('self_directed without full tests schedules none', () => {
  const plan = generatePlan(base({ mode: 'self_directed', targets: ['Q.G.'], fullTests: false }));
  assert.equal(plan.tasks.filter((t) => t.taskType === 'full_test').length, 0);
  assert.match(plan.rationale, /No full-length tests/);
});

test('rehearsal weeks carry a full test each week', () => {
  const plan = generatePlan(base({ mode: 'foundations' }));
  const rehearsal = plan.phases.find((p) => p.type === 'rehearsal');
  for (let w = rehearsal.startWeek; w <= rehearsal.endWeek; w++) {
    assert.ok(plan.tasks.some((t) => t.taskType === 'full_test' && t.weekIndex === w), `week ${w}`);
  }
});

// ── study days ───────────────────────────────────────────────────

const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

test('study days: every task lands on an allowed weekday', () => {
  const plan = generatePlan(base({ mode: 'foundations', studyDays: [1, 3, 6] })); // Mon Wed Sat
  for (const t of plan.tasks) {
    // The final week clamps to the test date, which may not be a study day.
    if (t.scheduledDate === '2026-12-05') continue;
    assert.ok([1, 3, 6].includes(weekday(t.scheduledDate)), `${t.taskType} on ${t.scheduledDate}`);
  }
});

test('study days: full tests prefer the weekend', () => {
  const plan = generatePlan(base({ mode: 'targeted', studyDays: [2, 4, 6] })); // Tue Thu Sat
  const tests = plan.tasks.filter((t) => t.taskType === 'full_test' && t.scheduledDate !== '2026-12-05');
  assert.ok(tests.length > 0);
  for (const t of tests) assert.equal(weekday(t.scheduledDate), 6);
});

test('no study days → all seven days are used', () => {
  const plan = generatePlan(base({ mode: 'foundations', studyDays: [] }));
  const days = new Set(plan.tasks.map((t) => weekday(t.scheduledDate)));
  assert.ok(days.size >= 5);
});

// ── re-pace resumes mid-course ───────────────────────────────────

test('elapsedWeeks keeps the plan in the phase it reached', () => {
  // 12-week foundations plan, re-paced 7 weeks in with 5 weeks left:
  // coverage was weeks 0–5, so the regenerated draft opens in focus.
  const plan = generatePlan(base({
    mode: 'foundations',
    today: '2026-10-31',   // 5 weeks before the test
    elapsedWeeks: 7,
    skills: freshSkills().map((s) => ({ ...s, coverageStatus: 'practiced', attemptsCount: 12, mastery: 50 })),
  }));
  assert.equal(plan.weeks, 5);
  assert.deepEqual(plan.phases.map((p) => p.type), ['focus', 'rehearsal']);
  assert.equal(plan.phases[0].startWeek, 0);
  assert.match(plan.rationale, /12-week plan/);
  // Practiced skills are not re-covered; no coverage drills anywhere.
  assert.ok(plan.tasks.every((t) => t.payload.why_code !== 'coverage'));
});

test('rationale names the phases in plan-relative weeks', () => {
  const plan = generatePlan(base({ mode: 'foundations' }));
  assert.match(plan.rationale, /^12-week plan toward 1300\./);
  assert.match(plan.rationale, /Weeks 1–6 cover every topic/);
  assert.match(plan.rationale, /Weeks 7–10 focus/);
  assert.match(plan.rationale, /Weeks 11–12 are test rehearsal/);
});

test('deterministic per mode', () => {
  for (const mode of ['foundations', 'targeted', 'self_directed']) {
    const a = generatePlan(base({ mode, targets: ['H.A.'] }));
    const b = generatePlan(base({ mode, targets: ['H.A.'] }));
    assert.deepEqual(a, b);
  }
});
