// Unit tests for the unit-syllabus authoring contract: shared field
// validation, CSV parse, and the replace-per-unit import plan.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeStepInput,
  parseSyllabusCsv,
  planSyllabusImport,
  parseSkillCodeList,
  parseYesNo,
  syllabusCsvTemplate,
  syllabusExportRows,
} from './unitSyllabusCsv.ts';

const LESSONS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', title: 'Solve by Graphing', status: 'published' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', title: 'Solve by Regression', status: 'published' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000003', title: 'Draft Lesson', status: 'draft' },
];
const PATTERNS = [
  { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'No-solution systems', skill_code: 'H.D.' },
];
const UNITS = [
  { id: 'cccccccc-0000-4000-8000-000000000001', skill_code: 'H.A.', domain_code: 'H' },
  { id: 'cccccccc-0000-4000-8000-000000000004', skill_code: 'H.D.', domain_code: 'H' },
];
const CTX = {
  units: UNITS,
  lessons: LESSONS,
  patterns: PATTERNS,
  existingCounts: new Map([[UNITS[0].id, 2]]),
};
const HEADER = 'skill_code,kind,lesson,role,skill_codes,pattern,question_count,minutes,skip_if_completed';

test('parseSkillCodeList splits on ; | , and whitespace, upper-cases, dedupes', () => {
  assert.deepEqual(parseSkillCodeList('h.a.; H.C. | h.a., H.D.'), ['H.A.', 'H.C.', 'H.D.']);
  assert.deepEqual(parseSkillCodeList(['H.A.', 'h.a.']), ['H.A.']);
  assert.deepEqual(parseSkillCodeList(''), []);
});

test('parseYesNo accepts the spreadsheet spellings and falls back on blank', () => {
  assert.equal(parseYesNo('Yes', false), true);
  assert.equal(parseYesNo('0', true), false);
  assert.equal(parseYesNo('', false), false);
  assert.equal(parseYesNo('maybe', true), null);
});

test('normalizeStepInput: a lesson step needs an existing lesson', () => {
  const ctx = { unitSkillCode: 'H.A.', lessonIds: new Set(LESSONS.map((l) => l.id)), patterns: PATTERNS };
  const ok = normalizeStepInput({ kind: 'lesson', lessonId: LESSONS[0].id, skipIfCompleted: 'no' }, ctx);
  assert.ok(ok.ok);
  assert.equal(ok.value.skipIfCompleted, false);
  assert.equal(ok.value.role, null);
  const missing = normalizeStepInput({ kind: 'lesson' }, ctx);
  assert.ok(!missing.ok);
  const unknown = normalizeStepInput({ kind: 'lesson', lessonId: 'nope' }, ctx);
  assert.ok(!unknown.ok && /does not exist/.test(unknown.error));
});

test('normalizeStepInput: drill defaults, ranges, and pattern scoping', () => {
  const ctx = { unitSkillCode: 'H.A.', lessonIds: new Set(), patterns: PATTERNS };
  const ok = normalizeStepInput({ kind: 'drill', skillCodes: 'H.A.; H.C.', questionCount: '6' }, ctx);
  assert.ok(ok.ok);
  assert.equal(ok.value.role, 'practice');
  assert.deepEqual(ok.value.skillCodes, ['H.A.', 'H.C.']);
  assert.equal(ok.value.questionCount, 6);
  const tooMany = normalizeStepInput({ kind: 'drill', questionCount: '99' }, ctx);
  assert.ok(!tooMany.ok && /question_count/.test(tooMany.error));
  const badSkill = normalizeStepInput({ kind: 'drill', skillCodes: 'ZZZ' }, ctx);
  assert.ok(!badSkill.ok && /unknown skill code/.test(badSkill.error));
  const wrongSkillPattern = normalizeStepInput({ kind: 'drill', patternId: PATTERNS[0].id }, ctx);
  assert.ok(!wrongSkillPattern.ok && /belongs to H\.D\./.test(wrongSkillPattern.error));
  const badKind = normalizeStepInput({ kind: 'quiz' }, ctx);
  assert.ok(!badKind.ok);
});

test('CSV: a unit\'s rows become one replacement syllabus in file order', () => {
  const csv = [
    HEADER,
    '"H.A.","lesson","solve by graphing",,,,,,',
    '"H.A.","drill",,"practice",,,6,,',
    '"H.A.","lesson","Solve by Regression",,,,,,"no"',
    '"H.A.","drill",,"mixed","H.A.; H.C.",,10,25,',
  ].join('\n');
  const plan = planSyllabusImport(parseSyllabusCsv(csv), CTX);
  assert.equal(plan.issues.length, 0);
  assert.equal(plan.units.length, 1);
  const unit = plan.units[0];
  assert.equal(unit.unitId, UNITS[0].id);
  assert.equal(unit.existingCount, 2);
  assert.deepEqual(unit.steps.map((s) => s.kind), ['lesson', 'drill', 'lesson', 'drill']);
  assert.equal(unit.steps[0].lessonId, LESSONS[0].id, 'title match is case-insensitive');
  assert.equal(unit.steps[2].skipIfCompleted, false);
  assert.deepEqual(unit.steps[3].skillCodes, ['H.A.', 'H.C.']);
  assert.equal(unit.steps[3].minutes, 25);
  assert.match(unit.steps[0].label, /^Lesson: Solve by Graphing/);
});

test('CSV: explicit positions win over file order', () => {
  const csv = [
    'skill_code,kind,lesson,role,position',
    '"H.A.","drill",,"mixed",3',
    '"H.A.","lesson","Solve by Graphing",,1',
    '"H.A.","drill",,"practice",',
  ].join('\n');
  const plan = planSyllabusImport(parseSyllabusCsv(csv), CTX);
  assert.equal(plan.issues.length, 0);
  assert.deepEqual(plan.units[0].steps.map((s) => `${s.kind}:${s.role ?? ''}`), ['lesson:', 'drill:mixed', 'drill:practice']);
});

test('CSV: a rejected row drops its whole unit, other units still import', () => {
  const csv = [
    HEADER,
    '"H.A.","lesson","No Such Lesson",,,,,,',
    '"H.A.","drill",,"practice",,,,,',
    '"H.D.","drill",,"practice",,"No-solution systems",6,,',
  ].join('\n');
  const plan = planSyllabusImport(parseSyllabusCsv(csv), CTX);
  assert.equal(plan.units.length, 1);
  assert.equal(plan.units[0].skillCode, 'H.D.');
  assert.equal(plan.units[0].steps[0].patternId, PATTERNS[0].id);
  assert.ok(plan.issues.some((i) => i.line === 2 && /No Such Lesson/.test(i.message)));
  assert.ok(plan.issues.some((i) => /H\.A\.: not imported/.test(i.message)));
});

test('CSV: unknown skill, pattern from another skill, and bad header are reported', () => {
  const bad = planSyllabusImport(parseSyllabusCsv([HEADER, '"ZZZ","drill",,,,,,,'].join('\n')), CTX);
  assert.ok(bad.issues.some((i) => /unknown skill_code "ZZZ"/.test(i.message)));
  const cross = planSyllabusImport(
    parseSyllabusCsv([HEADER, '"H.A.","drill",,"practice",,"No-solution systems",,,'].join('\n')),
    CTX,
  );
  assert.ok(cross.issues.some((i) => /no pattern "No-solution systems" in H\.A\./.test(i.message)));
  const header = parseSyllabusCsv('lesson,role\nfoo,bar');
  assert.equal(header.rows.length, 0);
  assert.match(header.issues[0].message, /missing required column/);
});

test('template parses clean against a matching bank', () => {
  const lessons = [
    'Solve Equations by Graphing: Find the x-Intercepts',
    'Solve Multiple Equations With List Regression',
    'Solve Systems of Equations by Graphing in Desmos',
    'Special Systems: No Solution and Infinitely Many Solutions',
  ].map((title, i) => ({ id: `dddddddd-0000-4000-8000-00000000000${i + 1}`, title, status: 'published' }));
  const plan = planSyllabusImport(parseSyllabusCsv(syllabusCsvTemplate()), { ...CTX, lessons });
  assert.deepEqual(plan.issues, []);
  assert.deepEqual(plan.units.map((u) => [u.skillCode, u.steps.length]), [['H.A.', 5], ['H.D.', 5]]);
});

test('export rows round-trip the columns the importer reads', () => {
  const rows = syllabusExportRows([
    { skill_code: 'H.A.', position: 1, kind: 'lesson', lesson_title: 'Solve by Graphing', role: null, skill_codes: null, pattern_name: null, question_count: null, minutes: null, skip_if_completed: true },
    { skill_code: 'H.A.', position: 2, kind: 'drill', lesson_title: null, role: 'mixed', skill_codes: ['H.A.', 'H.C.'], pattern_name: null, question_count: 10, minutes: null, skip_if_completed: true },
  ]);
  assert.equal(rows[0].lesson, 'Solve by Graphing');
  assert.equal(rows[0].skip_if_completed, 'yes');
  assert.equal(rows[1].skill_codes, 'H.A.; H.C.');
  assert.equal(rows[1].skip_if_completed, '');
});
