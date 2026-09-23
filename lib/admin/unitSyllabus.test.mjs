// Unit tests for the unit-syllabus step validator shared by the
// curriculum editor's forms and Server Actions.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeStepInput,
  parseSkillCodeList,
  parseYesNo,
  skillNameOf,
  domainForSkill,
} from './unitSyllabus.ts';

const LESSONS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Solve by Graphing', status: 'published' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', title: 'Solve by Regression', status: 'published' },
];
const PATTERNS = [
  { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'No-solution systems', skill_code: 'H.D.' },
];

test('parseSkillCodeList splits on ; | , and whitespace, upper-cases, dedupes', () => {
  assert.deepEqual(parseSkillCodeList('h.a.; H.C. | h.a., H.D.'), ['H.A.', 'H.C.', 'H.D.']);
  assert.deepEqual(parseSkillCodeList(['H.A.', 'h.a.']), ['H.A.']);
  assert.deepEqual(parseSkillCodeList(''), []);
});

test('parseYesNo accepts common spellings and falls back on blank', () => {
  assert.equal(parseYesNo('Yes', false), true);
  assert.equal(parseYesNo('0', true), false);
  assert.equal(parseYesNo('', false), false);
  assert.equal(parseYesNo(true, false), true);
  assert.equal(parseYesNo('maybe', true), null);
});

test('a lesson step needs an existing lesson; skip defaults to yes', () => {
  const ctx = { unitSkillCode: 'H.A.', lessonIds: new Set(LESSONS.map((l) => l.id)), patterns: PATTERNS };
  const ok = normalizeStepInput({ kind: 'lesson', lessonId: LESSONS[0].id }, ctx);
  assert.ok(ok.ok);
  assert.equal(ok.value.skipIfCompleted, true);
  assert.equal(ok.value.role, null);
  const off = normalizeStepInput({ kind: 'lesson', lessonId: LESSONS[0].id, skipIfCompleted: false }, ctx);
  assert.ok(off.ok && off.value.skipIfCompleted === false);
  assert.ok(!normalizeStepInput({ kind: 'lesson' }, ctx).ok);
  const unknown = normalizeStepInput({ kind: 'lesson', lessonId: 'nope' }, ctx);
  assert.ok(!unknown.ok && /does not exist/.test(unknown.error));
});

test('a drill step: defaults, ranges, skill list, and pattern scoping', () => {
  const ctx = { unitSkillCode: 'H.A.', lessonIds: new Set(), patterns: PATTERNS };
  const ok = normalizeStepInput({ kind: 'drill', skillCodes: ['H.A.', 'H.C.'], questionCount: 6 }, ctx);
  assert.ok(ok.ok);
  assert.equal(ok.value.role, 'practice');
  assert.deepEqual(ok.value.skillCodes, ['H.A.', 'H.C.']);
  assert.equal(ok.value.questionCount, 6);
  const mixed = normalizeStepInput({ kind: 'drill', role: 'mixed' }, ctx);
  assert.ok(mixed.ok && mixed.value.role === 'mixed' && mixed.value.skillCodes === null);
  const tooMany = normalizeStepInput({ kind: 'drill', questionCount: '99' }, ctx);
  assert.ok(!tooMany.ok && /question_count/.test(tooMany.error));
  const badMinutes = normalizeStepInput({ kind: 'drill', minutes: 2 }, ctx);
  assert.ok(!badMinutes.ok && /minutes/.test(badMinutes.error));
  const badSkill = normalizeStepInput({ kind: 'drill', skillCodes: 'ZZZ' }, ctx);
  assert.ok(!badSkill.ok && /unknown skill code/.test(badSkill.error));
  const wrongSkillPattern = normalizeStepInput({ kind: 'drill', patternId: PATTERNS[0].id }, ctx);
  assert.ok(!wrongSkillPattern.ok && /belongs to H\.D\./.test(wrongSkillPattern.error));
  const rightPattern = normalizeStepInput({ kind: 'drill', patternId: PATTERNS[0].id }, { ...ctx, unitSkillCode: 'H.D.' });
  assert.ok(rightPattern.ok && rightPattern.value.patternId === PATTERNS[0].id);
  assert.ok(!normalizeStepInput({ kind: 'quiz' }, ctx).ok);
});

test('taxonomy label helpers', () => {
  assert.equal(skillNameOf('H.A.'), 'Linear equations in one variable');
  assert.equal(domainForSkill('BOU'), 'SEC');
  assert.equal(skillNameOf('ZZZ'), 'ZZZ');
});
