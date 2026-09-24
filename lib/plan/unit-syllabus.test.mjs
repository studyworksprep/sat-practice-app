// Unit syllabi (docs/foundations-and-question-patterns.md §5): with
// PlanInput.unitSteps present, the generator walks each unit's ordered
// steps — lessons in teaching order, each followed by its practice
// drill, then a mixed set — instead of the built-in lesson-then-drill
// pair. Run with `node --test lib/plan/unit-syllabus.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan } from './generate-plan.ts';
import { buildSyllabi } from './unit-steps.ts';

function skill(over) {
  return {
    domainCode: 'H', skillCode: 'H.A.', section: 'math', mastery: null, attemptsCount: 0,
    coverageStatus: 'not_started', masteryThreshold: 80, learnability: 7, expectedMinutes: 60,
    sequence: 1, questionsAvailable: 100, hasLesson: true, ...over,
  };
}

const LESSON_GRAPH = { id: 'lesson-graph', title: 'Solve Equations by Graphing: Find the x-Intercepts' };
const LESSON_REGR = { id: 'lesson-regr', title: 'Solve Equations by Regression' };
const LESSON_SYSTEMS = { id: 'lesson-systems', title: 'Solve Systems by Graphing in Desmos' };

/** H.A. teaches graphing then regression (each with a practice set) and
 *  ends with a mixed set; H.D. teaches systems by graphing, then reuses
 *  the regression lesson. */
function syllabi() {
  return {
    'H.A.': [
      { id: 's1', position: 1, kind: 'lesson', lessonId: LESSON_GRAPH.id, lessonTitle: LESSON_GRAPH.title },
      { id: 's2', position: 2, kind: 'drill', role: 'practice', questionCount: 6 },
      { id: 's3', position: 3, kind: 'lesson', lessonId: LESSON_REGR.id, lessonTitle: LESSON_REGR.title },
      { id: 's4', position: 4, kind: 'drill', role: 'practice', questionCount: 6 },
      { id: 's5', position: 5, kind: 'drill', role: 'mixed' },
    ],
    'H.D.': [
      { id: 't1', position: 1, kind: 'lesson', lessonId: LESSON_SYSTEMS.id, lessonTitle: LESSON_SYSTEMS.title },
      { id: 't2', position: 2, kind: 'drill', role: 'practice' },
      { id: 't3', position: 3, kind: 'lesson', lessonId: LESSON_REGR.id, lessonTitle: LESSON_REGR.title },
      { id: 't4', position: 4, kind: 'drill', role: 'practice' },
      { id: 't5', position: 5, kind: 'drill', role: 'mixed' },
    ],
  };
}

function fixture(over = {}) {
  return {
    goalScore: 1400,
    startingScore: 1100,
    testDate: '2026-11-21', // 8 weeks
    today: '2026-09-26',
    weeklyHours: 5,
    testType: 'sat',
    mode: 'foundations',
    skills: [
      skill({ skillCode: 'H.A.', sequence: 1 }),
      skill({ skillCode: 'H.D.', sequence: 4 }),
    ],
    unitSteps: syllabi(),
    completedLessonIds: [],
    ...over,
  };
}

const skillTasks = (plan) => plan.tasks
  .filter((t) => t.taskType === 'lesson' || t.taskType === 'drill')
  .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.weekIndex - b.weekIndex);

test('coverage walks a unit\'s steps in order: lesson, practice, lesson, practice, mixed', () => {
  const plan = generatePlan(fixture());
  const first = skillTasks(plan).slice(0, 5).map((t) => t.payload.title);
  assert.deepEqual(first, [
    `Lesson: ${LESSON_GRAPH.title}`,
    `Practice: ${LESSON_GRAPH.title}`,
    `Lesson: ${LESSON_REGR.title}`,
    `Practice: ${LESSON_REGR.title}`,
    'Mixed practice: Algebra',
  ]);
});

test('a lesson step pins its lesson id and the drill after it links back', () => {
  const plan = generatePlan(fixture());
  const [lesson, practice] = skillTasks(plan);
  assert.equal(lesson.payload.lesson_id, LESSON_GRAPH.id);
  assert.equal(lesson.payload.unit_step_id, 's1');
  assert.equal(practice.payload.lesson_id, LESSON_GRAPH.id);
  assert.equal(practice.payload.drill_role, 'practice');
  assert.deepEqual(practice.payload.filter_criteria.skill_codes, ['H.A.']);
  assert.equal(practice.payload.filter_criteria.count, 6);
});

test('a technique shared by two units is taught once; the second unit keeps its drill', () => {
  const plan = generatePlan(fixture());
  const lessons = skillTasks(plan).filter((t) => t.taskType === 'lesson');
  const regr = lessons.filter((t) => t.payload.lesson_id === LESSON_REGR.id);
  assert.equal(regr.length, 1, 'regression lesson scheduled exactly once');
  // H.D.'s practice drill after the (skipped) regression lesson still runs,
  // titled after the lesson it exercises.
  const hd = skillTasks(plan).filter((t) => t.payload.skill_code === 'H.D.');
  assert.ok(hd.some((t) => t.payload.title === `Practice: ${LESSON_REGR.title}`));
});

test('a lesson the student already completed is skipped, its practice drill stays', () => {
  const plan = generatePlan(fixture({ completedLessonIds: [LESSON_GRAPH.id] }));
  const titles = skillTasks(plan).map((t) => t.payload.title);
  assert.ok(!titles.includes(`Lesson: ${LESSON_GRAPH.title}`));
  assert.equal(titles[0], `Practice: ${LESSON_GRAPH.title}`);
});

test('a mixed set draws from the domain\'s units walked so far', () => {
  const plan = generatePlan(fixture());
  const mixed = skillTasks(plan).filter((t) => t.payload.drill_role === 'mixed');
  assert.ok(mixed.length >= 2);
  assert.deepEqual(mixed[0].payload.filter_criteria.skill_codes, ['H.A.']);
  assert.deepEqual(mixed[1].payload.filter_criteria.skill_codes, ['H.A.', 'H.D.']);
  assert.equal(mixed[0].payload.filter_criteria.count, 10);
});

test('a second pass over the curriculum revisits mixed sets only, never re-teaches', () => {
  // 8 weeks × ~7 slots is far more than the two units' 10 steps.
  const plan = generatePlan(fixture());
  const tasks = skillTasks(plan);
  const lessons = tasks.filter((t) => t.taskType === 'lesson');
  assert.equal(lessons.length, 3, 'three distinct lessons, each once');
  const afterFirstPass = tasks.slice(10);
  assert.ok(afterFirstPass.length > 0);
  for (const t of afterFirstPass) {
    // Later passes are mixed sets (or, in focus weeks, syllabus drills) — no lessons.
    assert.equal(t.taskType, 'drill');
  }
});

test('self-directed plans walk only the chosen units\' syllabi', () => {
  const plan = generatePlan(fixture({ mode: 'self_directed', targets: ['H.D.'] }));
  const tasks = skillTasks(plan);
  assert.ok(tasks.length > 0);
  for (const t of tasks) assert.equal(t.payload.skill_code, 'H.D.');
  assert.equal(tasks[0].payload.title, `Lesson: ${LESSON_SYSTEMS.title}`);
});

test('a unit with no syllabus rows falls back to the built-in pair', () => {
  const plan = generatePlan(fixture({
    skills: [skill({ skillCode: 'H.B.', sequence: 2, hasLesson: true })],
    unitSteps: {},
  }));
  const [lesson, drill] = skillTasks(plan);
  assert.equal(lesson.taskType, 'lesson');
  assert.equal(lesson.payload.title, 'Lesson: Linear functions');
  assert.equal(lesson.payload.lesson_id, undefined);
  assert.equal(drill.taskType, 'drill');
});

test('explicit technique narrowing rides the drill\'s filter_criteria', () => {
  const steps = syllabi();
  steps['H.A.'][1].techniqueIds = ['technique-1', 'technique-2'];
  const plan = generatePlan(fixture({ unitSteps: steps }));
  const [, practice, , second] = skillTasks(plan);
  assert.deepEqual(practice.payload.filter_criteria.technique_ids, ['technique-1', 'technique-2']);
  // A step without narrowing carries no key at all.
  assert.equal(second.payload.filter_criteria.technique_ids, undefined);
});

// ── Technique narrowing (docs §8.5 step C) ─────────────────────────

test('a practice drill narrows to the preceding lesson\'s techniques by default and says so', () => {
  const steps = syllabi();
  steps['H.A.'][0].techniqueIds = ['t-graph'];
  steps['H.A.'][0].techniqueNames = ['Solve by graphing'];
  const plan = generatePlan(fixture({ unitSteps: steps }));
  const [lesson, practice] = skillTasks(plan);
  assert.deepEqual(lesson.payload.technique_names, ['Solve by graphing']);
  assert.deepEqual(practice.payload.filter_criteria.technique_ids, ['t-graph']);
  assert.deepEqual(practice.payload.technique_names, ['Solve by graphing']);
  assert.match(practice.payload.why, /^Questions solved by Solve by graphing come first, then the rest of Linear equations in one variable\.$/);
  // The silent coverage code yields to the technique note.
  assert.equal(practice.payload.why_code, undefined);
});

test('techniqueSource none draws the whole skill; explicit uses its own list; mixed never narrows', () => {
  const steps = syllabi();
  steps['H.A.'][0].techniqueIds = ['t-graph'];
  steps['H.A.'][0].techniqueNames = ['Solve by graphing'];
  steps['H.A.'][1].techniqueSource = 'none';
  steps['H.A.'][2].techniqueIds = ['t-regr'];
  steps['H.A.'][2].techniqueNames = ['Solve by regression'];
  steps['H.A.'][3].techniqueSource = 'explicit';
  steps['H.A.'][3].techniqueIds = ['t-lists', 't-regr'];
  steps['H.A.'][3].techniqueNames = ['Desmos lists', 'Solve by regression'];
  steps['H.A.'][4].techniqueIds = ['t-lists']; // a mixed set ignores any narrowing
  const plan = generatePlan(fixture({ unitSteps: steps }));
  const [, whole, , explicit, mixed] = skillTasks(plan);
  assert.equal(whole.payload.filter_criteria.technique_ids, undefined);
  assert.equal(whole.payload.why_code, 'coverage');
  assert.deepEqual(explicit.payload.filter_criteria.technique_ids, ['t-lists', 't-regr']);
  assert.match(explicit.payload.why, /Desmos lists and Solve by regression come first/);
  assert.equal(mixed.payload.drill_role, 'mixed');
  assert.equal(mixed.payload.filter_criteria.technique_ids, undefined);
});

test('a completed (skipped) lesson still narrows the practice after it', () => {
  const steps = syllabi();
  steps['H.A.'][0].techniqueIds = ['t-graph'];
  steps['H.A.'][0].techniqueNames = ['Solve by graphing'];
  const plan = generatePlan(fixture({ unitSteps: steps, completedLessonIds: [LESSON_GRAPH.id] }));
  const [practice] = skillTasks(plan);
  assert.equal(practice.payload.title, `Practice: ${LESSON_GRAPH.title}`);
  assert.deepEqual(practice.payload.filter_criteria.technique_ids, ['t-graph']);
});

test('a real reason precedes the technique note; ids without names get the generic note', () => {
  const steps = syllabi();
  steps['H.A.'][0].techniqueIds = ['t-graph'];
  // Focus phase: targeted mode ranks skills instead of walking coverage.
  const plan = generatePlan(fixture({ unitSteps: steps, mode: 'targeted', skills: [skill({ skillCode: 'H.A.', sequence: 1, mastery: 20, attemptsCount: 12, coverageStatus: 'in_progress' })] }));
  const practice = plan.tasks.find((t) => t.taskType === 'drill' && t.payload.unit_step_id === 's2');
  assert.ok(practice, 'the syllabus practice drill is scheduled');
  assert.match(practice.payload.why, /^.+ Questions for the lesson's techniques come first, then the rest of Linear equations in one variable\.$/);
  assert.equal(practice.payload.why_code, undefined);
});

test('without unitSteps the generator is unchanged (skill-named lesson, then drill)', () => {
  const plan = generatePlan(fixture({ unitSteps: null, completedLessonIds: null }));
  const [lesson, drill] = skillTasks(plan);
  assert.equal(lesson.payload.title, 'Lesson: Linear equations in one variable');
  assert.equal(drill.payload.title, 'Drill: Linear equations in one variable');
  assert.equal(drill.payload.drill_role, undefined);
});

test('rationale names the syllabus walk', () => {
  const plan = generatePlan(fixture());
  assert.match(plan.rationale, /each topic's lessons/);
});

// ── buildSyllabi (loader grouping) ─────────────────────────────────

test('buildSyllabi groups by skill, orders by position, drops unpublished lessons', () => {
  const rows = [
    { id: 'b', position: 2, kind: 'drill', lesson_id: null, role: 'practice', skill_codes: null, technique_ids: null, technique_source: 'lesson', question_count: 8, minutes: null, skip_if_completed: true, unit: { skill_code: 'H.A.', test_type: 'sat' }, lesson: null },
    { id: 'a', position: 1, kind: 'lesson', lesson_id: 'L1', role: null, skill_codes: null, technique_ids: null, question_count: null, minutes: null, skip_if_completed: true, unit: { skill_code: 'H.A.', test_type: 'sat' }, lesson: { title: 'Graphing', status: 'published', lesson_techniques: [{ technique_id: 't-graph', technique: { name: 'Solve by graphing' } }] } },
    { id: 'c', position: 3, kind: 'lesson', lesson_id: 'L2', role: null, skill_codes: null, technique_ids: null, question_count: null, minutes: null, skip_if_completed: true, unit: { skill_code: 'H.A.', test_type: 'sat' }, lesson: { title: 'Draft', status: 'draft' } },
    { id: 'd', position: 1, kind: 'drill', lesson_id: null, role: 'mixed', skill_codes: ['H.A.', 'H.B.'], technique_ids: null, technique_source: 'none', question_count: null, minutes: 25, skip_if_completed: true, unit: [{ skill_code: 'H.B.', test_type: 'sat' }], lesson: null },
    { id: 'e', position: 2, kind: 'drill', lesson_id: null, role: 'practice', skill_codes: null, technique_ids: ['t-regr'], technique_source: 'explicit', question_count: null, minutes: null, skip_if_completed: true, unit: { skill_code: 'H.B.', test_type: 'sat' }, lesson: null },
  ];
  const out = buildSyllabi(rows);
  assert.deepEqual(out['H.A.'].map((s) => s.id), ['a', 'b']);
  assert.equal(out['H.A.'][0].lessonTitle, 'Graphing');
  assert.deepEqual(out['H.A.'][0].techniqueIds, ['t-graph']);
  assert.deepEqual(out['H.A.'][0].techniqueNames, ['Solve by graphing']);
  assert.equal(out['H.A.'][1].techniqueSource, 'lesson');
  assert.equal(out['H.A.'][1].techniqueIds, null);
  assert.equal(out['H.B.'][0].role, 'mixed');
  assert.deepEqual(out['H.B.'][0].skillCodes, ['H.A.', 'H.B.']);
  assert.equal(out['H.B.'][0].minutes, 25);
  assert.equal(out['H.B.'][0].techniqueSource, 'none');
  // Explicit narrowing resolves its names through the catalog map.
  const named = buildSyllabi(rows, new Map([['t-regr', 'Solve by regression']]));
  assert.equal(named['H.B.'][1].techniqueSource, 'explicit');
  assert.deepEqual(named['H.B.'][1].techniqueIds, ['t-regr']);
  assert.deepEqual(named['H.B.'][1].techniqueNames, ['Solve by regression']);
  assert.equal(out['H.B.'][1].techniqueNames, null);
});
