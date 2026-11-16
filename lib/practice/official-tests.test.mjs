import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  calendarDay,
  countedOfficialScores,
  isIsoDate,
  isSelfReported,
  parseTestType,
  resolveTestDate,
  soonestUpcoming,
  validateSectionScores,
  withArticle,
} from './official-tests.ts';
import { buildArchiveSummary } from './superscore.js';

const STUDENT = '33333333-3333-3333-3333-333333333333';
const TUTOR = '22222222-2222-2222-2222-222222222222';

test('self-reported means the student wrote the row', () => {
  assert.equal(isSelfReported({ student_id: STUDENT, created_by: STUDENT }), true);
  assert.equal(isSelfReported({ student_id: STUDENT, created_by: TUTOR }), false);
  // Missing ids read as tutor-entered, never as self-reported.
  assert.equal(isSelfReported({ student_id: STUDENT, created_by: null }), false);
  assert.equal(isSelfReported({}), false);
});

test('countedOfficialScores drops only self-reported rows', () => {
  const rows = [
    { id: 'a', student_id: STUDENT, created_by: TUTOR },
    { id: 'b', student_id: STUDENT, created_by: STUDENT },
    { id: 'c', student_id: STUDENT, created_by: null },
  ];
  assert.deepEqual(countedOfficialScores(rows).map((r) => r.id), ['a', 'c']);
});

test('section score ranges follow the test type', () => {
  assert.equal(validateSectionScores('SAT', 650, 700), null);
  assert.equal(validateSectionScores('PSAT', 160, 760), null);
  assert.match(validateSectionScores('SAT', 190, 700), /between 200 and 800/);
  assert.match(validateSectionScores('PSAT', 770, 600), /between 160 and 760/);
  assert.match(validateSectionScores('SAT', 655, 700), /steps of 10/);
  assert.match(validateSectionScores('SAT', NaN, 700), /numbers/);
  assert.equal(parseTestType('PSAT'), 'PSAT');
  assert.equal(parseTestType('ACT'), 'SAT');
  assert.equal(parseTestType(null), 'SAT');
  assert.equal(withArticle('SAT'), 'an SAT');
  assert.equal(withArticle('PSAT'), 'a PSAT');
});

test('dates: real calendar days only', () => {
  assert.equal(isIsoDate('2027-03-13'), true);
  assert.equal(isIsoDate('2027-02-30'), false);
  assert.equal(isIsoDate('2027-3-13'), false);
  assert.equal(isIsoDate(null), false);
  assert.equal(calendarDay('2027-03-13T08:00:00+00:00'), '2027-03-13');
  assert.equal(calendarDay(null), null);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('soonestUpcoming ignores past dates', () => {
  const today = '2026-11-15';
  assert.equal(soonestUpcoming(['2026-10-04', '2027-05-01', '2027-03-13'], today), '2027-03-13');
  assert.equal(soonestUpcoming(['2026-11-15'], today), '2026-11-15');
  assert.equal(soonestUpcoming(['2026-10-04', null], today), null);
});

test('resolveTestDate: plan, then chosen date, then registration', () => {
  const today = '2026-11-15';
  assert.equal(
    resolveTestDate({ planDate: '2027-06-06', profileDate: '2027-03-13', nextRegistration: '2026-12-06', today }),
    '2027-06-06',
  );
  // The chosen date beats a registration the student isn't studying for.
  assert.equal(
    resolveTestDate({ profileDate: '2027-03-13T00:00:00+00:00', nextRegistration: '2026-12-06', today }),
    '2027-03-13',
  );
  // Nothing chosen: a tutor's registration fills in.
  assert.equal(resolveTestDate({ profileDate: null, nextRegistration: '2026-12-06', today }), '2026-12-06');
  // A passed chosen date gives way to an upcoming registration...
  assert.equal(resolveTestDate({ profileDate: '2026-10-04', nextRegistration: '2026-12-06', today }), '2026-12-06');
  // ...and is still returned when there is nothing else.
  assert.equal(resolveTestDate({ profileDate: '2026-10-04', today }), '2026-10-04');
  assert.equal(resolveTestDate({ today }), null);
});

test('tutor impact numbers ignore self-reported scores', () => {
  const summary = buildArchiveSummary({
    officialScores: [
      { test_date: '2026-03-14', rw_score: 550, math_score: 560, composite_score: 1110, student_id: STUDENT, created_by: TUTOR },
      { test_date: '2026-10-04', rw_score: 600, math_score: 620, composite_score: 1220, student_id: STUDENT, created_by: TUTOR },
      // A self-reported 1600 must not move final score, impact or reach.
      { test_date: '2026-11-01', rw_score: 800, math_score: 800, composite_score: 1600, student_id: STUDENT, created_by: STUDENT },
    ],
    practiceTests: [],
    startDate: '2026-06-01',
    targetScore: 1400,
  });
  assert.equal(summary.startingScore, 1110);
  assert.equal(summary.finalScore, 1220);
  assert.equal(summary.impact, 110);
  assert.equal(summary.targetReachPct, 87);
});
