import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACT_FORMAT_SPECS,
  breakRemainingMs,
  buildSectionPlan,
  compositeScore,
  isSectionComplete,
  minutesLabel,
  sectionCompleteness,
  parsePlan,
  parseSectionSelection,
  parseTimeMultiplier,
  sectionTimeLimitMs,
} from './act-test-plan.ts';

const ids = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

test('sectionTimeLimitMs uses the official limit for a full section and pro-rates a shorter one', () => {
  assert.equal(sectionTimeLimitMs('classic', 'english', 75), 45 * 60_000);
  assert.equal(sectionTimeLimitMs('enhanced', 'math', 45), 50 * 60_000);
  // A released enhanced form omits the unscored items: 40 of the 50
  // administered English questions → 35 min × 0.8 = 28 min, the same pace.
  assert.equal(sectionTimeLimitMs('enhanced', 'english', 40), 28 * 60_000);
  // Rounded to the half minute: classic Reading 35 × 27/40 = 23.625 → 23.5 min.
  assert.equal(sectionTimeLimitMs('classic', 'reading', 27), 23.5 * 60_000);
  // Never more than the official limit, never under a minute.
  assert.equal(sectionTimeLimitMs('classic', 'math', 90), 60 * 60_000);
  assert.equal(sectionTimeLimitMs('classic', 'math', 1), 60_000);
});

test('a released enhanced form is complete at 40/41/27/34 and keeps the official pace', () => {
  const released = { english: 40, math: 41, reading: 27, science: 34 };
  for (const [section, n] of Object.entries(released)) {
    assert.equal(ACT_FORMAT_SPECS.enhanced.sections[section].released, n);
    assert.equal(isSectionComplete('enhanced', section, n), true);
    assert.equal(isSectionComplete('enhanced', section, n - 1), false);
  }
  // Classic released forms carry every administered question.
  for (const section of ['english', 'math', 'reading', 'science']) {
    const spec = ACT_FORMAT_SPECS.classic.sections[section];
    assert.equal(spec.released, spec.questions);
    assert.equal(isSectionComplete('classic', section, spec.questions), true);
  }
  assert.equal(sectionTimeLimitMs('enhanced', 'english', 40), 28 * 60_000);
  assert.equal(sectionTimeLimitMs('enhanced', 'math', 41), 45.5 * 60_000);
  assert.equal(sectionTimeLimitMs('enhanced', 'reading', 27), 30 * 60_000);
  assert.equal(sectionTimeLimitMs('enhanced', 'science', 34), 34 * 60_000);
});

test('sectionCompleteness tells released exams from online practice tests', () => {
  assert.equal(sectionCompleteness('enhanced', 'released', 'english', 40), 'complete');
  assert.equal(sectionCompleteness('enhanced', 'released', 'english', 39), 'partial');
  assert.equal(sectionCompleteness('enhanced', 'practice', 'math', 45), 'full_length');
  assert.equal(sectionCompleteness('enhanced', 'practice', 'math', 41), 'scored_only');
  assert.equal(sectionCompleteness('enhanced', 'practice', 'math', 40), 'partial');
  assert.equal(sectionCompleteness('classic', 'practice', 'english', 75), 'complete');
  assert.equal(sectionCompleteness('classic', 'released', 'english', 74), 'partial');
  assert.equal(isSectionComplete('enhanced', 'math', 41, 'practice'), true);
  assert.equal(isSectionComplete('enhanced', 'math', 40, 'practice'), false);
});

test('the multiplier scales the limit', () => {
  assert.equal(sectionTimeLimitMs('enhanced', 'reading', 36, 1.5), 60 * 60_000);
  assert.equal(sectionTimeLimitMs('classic', 'science', 40, 2), 70 * 60_000);
  assert.equal(parseTimeMultiplier('1.5'), 1.5);
  assert.equal(parseTimeMultiplier(2), 2);
  assert.equal(parseTimeMultiplier('3'), 1);
  assert.equal(parseTimeMultiplier(undefined), 1);
});

test('buildSectionPlan orders sections, skips absent ones and puts the break after Math only when something follows', () => {
  const plan = buildSectionPlan({
    format: 'enhanced',
    multiplier: 1,
    questionsBySection: { reading: ids('r', 36), math: ids('m', 45), english: ids('e', 50) },
  });
  assert.deepEqual(plan.map((s) => s.section), ['english', 'math', 'reading']);
  assert.deepEqual(plan.map((s) => s.index), [0, 1, 2]);
  assert.deepEqual(plan.map((s) => s.break_after_ms), [0, 15 * 60_000, 0]);
  assert.deepEqual(plan.map((s) => s.time_limit_ms), [35 * 60_000, 50 * 60_000, 40 * 60_000]);
  assert.equal(plan[1].question_count, 45);
  assert.equal(plan[0].status, 'pending');

  const mathOnly = buildSectionPlan({ format: 'enhanced', multiplier: 1, questionsBySection: { math: ids('m', 45) } });
  assert.equal(mathOnly.length, 1);
  assert.equal(mathOnly[0].break_after_ms, 0);

  const classic = buildSectionPlan({
    format: 'classic',
    multiplier: 1,
    questionsBySection: { english: ids('e', 75), math: ids('m', 60), reading: ids('r', 40), science: ids('s', 40) },
  });
  assert.deepEqual(classic.map((s) => s.break_after_ms), [0, 10 * 60_000, 0, 0]);
});

test('parsePlan round-trips a plan and rejects malformed input', () => {
  const plan = buildSectionPlan({ format: 'classic', multiplier: 1, questionsBySection: { math: ids('m', 3) } });
  const json = JSON.parse(JSON.stringify(plan));
  assert.deepEqual(parsePlan(json), plan);
  assert.deepEqual(parsePlan([]), []);
  assert.deepEqual(parsePlan(null), []);
  assert.deepEqual(parsePlan([{ section: 'nope', question_ids: [] }]), []);
  assert.deepEqual(parsePlan([{ section: 'math' }]), []);
  const loose = parsePlan([{ section: 'math', question_ids: ['a'], status: 'weird' }]);
  assert.equal(loose[0].status, 'pending');
  assert.equal(loose[0].question_count, 1);
});

test('compositeScore follows the format rule and rounds halves up', () => {
  assert.equal(compositeScore('classic', { english: 20, math: 21, reading: 22, science: 24 }), 22);
  assert.equal(compositeScore('classic', { english: 20, math: 21, reading: 22, science: null }), null);
  // Enhanced ignores Science: (20 + 21 + 22) / 3 = 21.
  assert.equal(compositeScore('enhanced', { english: 20, math: 21, reading: 22, science: null }), 21);
  assert.equal(compositeScore('enhanced', { english: 20, math: 21, reading: null }), null);
  // 21.5 → 22.
  assert.equal(compositeScore('enhanced', { english: 21, math: 21, reading: 22 }), 21);
  assert.equal(compositeScore('classic', { english: 21, math: 22, reading: 22, science: 21 }), 22);
});

test('breakRemainingMs counts down from the section finish and clamps at zero', () => {
  const [math] = buildSectionPlan({ format: 'classic', multiplier: 1, questionsBySection: { math: ids('m', 60), reading: ids('r', 40) } });
  assert.equal(breakRemainingMs(math), 0); // not finished yet
  const finished = { ...math, status: 'completed', finished_at: '2026-10-12T10:00:00.000Z' };
  const t = Date.parse('2026-10-12T10:04:00.000Z');
  assert.equal(breakRemainingMs(finished, t), 6 * 60_000);
  assert.equal(breakRemainingMs(finished, t + 60 * 60_000), 0);
});

test('minutesLabel', () => {
  assert.equal(minutesLabel(35 * 60_000), '35 min');
  assert.equal(minutesLabel(60 * 60_000), '1 h');
  assert.equal(minutesLabel(75 * 60_000), '1 h 15 min');
});


test('section selection defaults to the full form for older clients and assignment starts', () => {
  assert.equal(parseSectionSelection(new FormData()), undefined);
});

test('custom section selection validates the request and deduplicates in ACT order', () => {
  const form = new FormData();
  form.set('section_selection', 'custom');
  assert.throws(() => parseSectionSelection(form), /at least one section/);
  form.append('sections', 'science');
  form.append('sections', 'math');
  form.append('sections', 'math');
  assert.deepEqual(parseSectionSelection(form), ['math', 'science']);
  form.append('sections', 'writing');
  assert.throws(() => parseSectionSelection(form), /valid ACT sections/);
});

test('selected sections exclude all other questions and retain extended-time pacing', () => {
  const plan = buildSectionPlan({
    format: 'enhanced', multiplier: 1.5,
    questionsBySection: { english: ids('e', 50), math: ids('m', 45), reading: ids('r', 36) },
    selectedSections: ['reading'],
  });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].section, 'reading');
  assert.deepEqual(plan[0].question_ids, ids('r', 36));
  assert.equal(plan[0].time_limit_ms, 60 * 60_000);
  assert.equal(plan[0].break_after_ms, 0);
  assert.equal(plan[0].index, 0);
});

test('non-adjacent selections keep ACT order, contiguous indexes, and only necessary breaks', () => {
  const input = {
    format: 'enhanced', multiplier: 2,
    questionsBySection: { english: ids('e', 50), math: ids('m', 45), reading: ids('r', 36), science: ids('s', 40) },
    selectedSections: ['science', 'math'],
  };
  const plan = buildSectionPlan(input);
  assert.deepEqual(plan.map((section) => section.section), ['math', 'science']);
  assert.deepEqual(plan.map((section) => section.index), [0, 1]);
  assert.deepEqual(plan.map((section) => section.time_limit_ms), [100 * 60_000, 80 * 60_000]);
  assert.deepEqual(plan.map((section) => section.break_after_ms), [15 * 60_000, 0]);
  const mathOnly = buildSectionPlan({ ...input, selectedSections: ['math'] });
  assert.equal(mathOnly[0].break_after_ms, 0);
  assert.deepEqual(parsePlan(JSON.parse(JSON.stringify(plan))), plan);
});

test('empty or unavailable selections cannot silently fall back to a full test', () => {
  const input = { format: 'classic', multiplier: 1, questionsBySection: { math: ids('m', 60) } };
  assert.throws(() => buildSectionPlan({ ...input, selectedSections: [] }), /at least one section/);
  assert.throws(() => buildSectionPlan({ ...input, selectedSections: ['math', 'reading'] }), /unavailable/);
});
