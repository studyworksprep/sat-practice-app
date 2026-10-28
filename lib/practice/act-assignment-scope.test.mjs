import test from 'node:test';
import assert from 'node:assert/strict';
import { parseActAssignmentScope, matchesActSectionPlan, satisfiesActAssignmentScope } from './act-assignment-scope.ts';
import { ACT_SECTIONS } from './act-taxonomy.ts';
import { buildSectionPlan, compositeScore } from './act-test-plan.ts';

const matchesActAssignmentScope = (sections, scope) => matchesActSectionPlan(sections, plan(scope === 'all' ? ACT_SECTIONS : [scope]));

const plan = (sections, format = 'classic', status = 'completed') => buildSectionPlan({
  format, multiplier: 1,
  questionsBySection: Object.fromEntries(sections.map(s => [s, [`${s}-1`]])),
}).map(s => ({ ...s, status }));

test('old assignments default to the whole test; invalid selections are rejected', () => {
  for (const value of [undefined, null, 'all']) assert.equal(parseActAssignmentScope(value), 'all');
  for (const section of ACT_SECTIONS) assert.equal(parseActAssignmentScope(section), section);
  for (const value of ['', 'rw', 'both', [], ['all'], ['math', 'rw'], {}]) assert.equal(parseActAssignmentScope(value), null);
});

test('each section resumes only its own attempt and completes only its own assignment', () => {
  for (const section of ACT_SECTIONS) {
    const single = plan([section]);
    assert.equal(matchesActAssignmentScope(single, section), true);
    assert.equal(matchesActAssignmentScope(single, 'all'), false);
    assert.equal(satisfiesActAssignmentScope(single, 'classic', 'all'), false);
    assert.equal(satisfiesActAssignmentScope(single, 'enhanced', undefined), false);
    for (const other of ACT_SECTIONS) {
      assert.equal(matchesActAssignmentScope(single, other), section === other);
      assert.equal(satisfiesActAssignmentScope(single, 'classic', other), section === other);
    }
    assert.equal(satisfiesActAssignmentScope(plan([section], 'classic', 'pending'), 'classic', section), false);
  }
});

test('a full attempt satisfies section assignments without resuming as a single section', () => {
  const full = plan(ACT_SECTIONS);
  assert.equal(matchesActAssignmentScope(full, 'all'), true);
  assert.equal(satisfiesActAssignmentScope(full, 'classic', undefined), true);
  for (const section of ACT_SECTIONS) {
    assert.equal(matchesActAssignmentScope(full, section), false);
    assert.equal(satisfiesActAssignmentScope(full, 'classic', section), true);
  }
  const core = plan(['english', 'math', 'reading'], 'enhanced');
  assert.equal(satisfiesActAssignmentScope(core, 'enhanced', 'all'), true);
  assert.equal(satisfiesActAssignmentScope(core, 'classic', 'all'), false);
  assert.equal(satisfiesActAssignmentScope(core, 'enhanced', 'science'), false);
});

test('a standalone Math section retains accommodation timing with no following break or composite', () => {
  const [math] = buildSectionPlan({ format: 'classic', multiplier: 1.5,
    questionsBySection: { math: Array.from({ length: 60 }, (_, i) => `math-${i}`) } });
  assert.equal(math.index, 0);
  assert.equal(math.question_count, 60);
  assert.equal(math.time_limit_ms, 90 * 60_000);
  assert.equal(math.break_after_ms, 0);
  assert.equal(compositeScore('classic', { math: 30 }), null);
  assert.equal(compositeScore('enhanced', { math: 30 }), null);
});

test('resuming custom combinations requires an exact section set', () => {
  const pair = plan(['english', 'math']);
  assert.equal(matchesActSectionPlan(pair, plan(ACT_SECTIONS)), false);
  assert.equal(matchesActSectionPlan(pair, plan(['english', 'math'])), true);
  assert.equal(matchesActSectionPlan(pair, plan(['math', 'reading'])), false);
  assert.equal(satisfiesActAssignmentScope(pair, 'enhanced', 'all'), false);
});

test('multiple sections normalize in test order and require every assigned section', () => {
  assert.deepEqual(parseActAssignmentScope(['reading', 'math', 'math']), ['math', 'reading']);
  const selected = ['math', 'reading'];
  assert.equal(satisfiesActAssignmentScope(plan(['math']), 'classic', selected), false);
  assert.equal(satisfiesActAssignmentScope(plan(['math', 'reading']), 'classic', selected), true);
  assert.equal(satisfiesActAssignmentScope(plan(ACT_SECTIONS), 'classic', selected), true);
});

test('an explicit Science assignment cannot be completed by enhanced core sections alone', () => {
  assert.equal(satisfiesActAssignmentScope(plan(['english', 'math', 'reading']), 'enhanced', ACT_SECTIONS), false);
});

test('resuming preserves the chosen timing and does not reuse a standard-time attempt for extra time', () => {
  const make = multiplier => buildSectionPlan({ format: 'classic', multiplier,
    questionsBySection: { math: Array.from({ length: 60 }, (_, i) => String(i)) } });
  assert.equal(matchesActSectionPlan(make(1), make(1.5)), false);
  assert.equal(matchesActSectionPlan(make(1.5), make(2)), false);
  assert.equal(matchesActSectionPlan(make(1.5), make(1.5)), true);
  assert.equal(make(2)[0].time_limit_ms, 120 * 60_000);
});

test('untimed and timed attempts cannot resume one another', () => {
  const input = { format: 'classic', multiplier: 1, questionsBySection: { math: ['q1'] } };
  const timed = buildSectionPlan(input);
  const untimed = buildSectionPlan({ ...input, untimed: true });
  assert.equal(matchesActSectionPlan(timed, untimed), false);
  assert.equal(matchesActSectionPlan(untimed, timed), false);
  assert.equal(matchesActSectionPlan(untimed, JSON.parse(JSON.stringify(untimed))), true);
});
