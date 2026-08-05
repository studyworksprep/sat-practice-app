// Fixture tests for the server-side Bluebook report parser.
//
// The fixtures in ./fixtures are synthetic. No real College Board export
// was in the repo when parsing moved server-side, and checking one in
// would mean checking in a real student's answers. Each fixture instead
// reproduces a structure the original browser parser was written
// against, and its header records the counts asserted here — so a
// regression shows up as a count mismatch, not a silent reshape.
//
// If a real export of a new vintage ever turns up, add it as another
// fixture rather than editing these: the point of the artifact bucket is
// that reports stay re-parseable across format changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseBluebookReport,
  toResponseVector,
  computeModuleStats,
  moduleKey,
  BluebookParseError,
} from './parse-report.ts';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('current vintage: per-row classes, counts split by module', () => {
  const parsed = parseBluebookReport(fixture('report-new-format.html'));

  assert.equal(parsed.testName, 'SAT Practice 11');
  assert.equal(parsed.testDate, 'February 21, 2026');
  assert.equal(parsed.reportDate, '2026-02-21');
  assert.equal(parsed.questions.length, 12);

  assert.deepEqual(parsed.correctCounts.rw, { m1: 2, m2: 1, total: 3 });
  assert.deepEqual(parsed.correctCounts.math, { m1: 1, m2: 2, total: 3 });
});

test('current vintage: answer cells, SPR detection, omitted rows', () => {
  const { questions } = parseBluebookReport(fixture('report-new-format.html'));
  const at = (subject, module, ordinal) =>
    questions.find(
      (q) => q.subjectCode === subject && q.moduleNumber === module && q.ordinal === ordinal,
    );

  const correct = at('RW', 1, 1);
  assert.equal(correct.correctAnswer, 'B');
  assert.equal(correct.studentAnswer, 'B');
  assert.equal(correct.isCorrect, true);
  assert.equal(correct.questionType, 'mcq');
  assert.equal(correct.domain, 'Information and Ideas');

  const wrong = at('RW', 1, 2);
  assert.equal(wrong.correctAnswer, 'D');
  assert.equal(wrong.studentAnswer, 'A', 'the real chosen answer survives');
  assert.equal(wrong.isCorrect, false);
  assert.equal(wrong.synthesized, false);

  // "Omitted" is a status-only cell: no answer to read, and not correct.
  const omitted = at('RW', 2, 3);
  assert.equal(omitted.isCorrect, false);
  assert.equal(omitted.synthesized, true, 'nothing to read, so a placeholder is invented');

  // A numeric key means student-produced response, not multiple choice.
  const spr = at('MATH', 1, 2);
  assert.equal(spr.questionType, 'spr');
  assert.equal(spr.correctAnswer, '17');
  assert.equal(spr.studentAnswer, '12');

  // Regression guard: '0' is a legitimate SPR key and must not be
  // treated as absent.
  const zeroKey = at('MATH', 2, 2);
  assert.equal(zeroKey.correctAnswer, '0');
  assert.equal(zeroKey.isCorrect, true);
});

test('older vintage: section and module come from the headings', () => {
  const parsed = parseBluebookReport(fixture('report-old-format.html'));

  assert.equal(parsed.testName, 'SAT Practice 6');
  assert.equal(parsed.reportDate, '2025-11-02');
  assert.equal(parsed.questions.length, 8, 'header rows are skipped, question rows are not');

  assert.deepEqual(parsed.correctCounts.rw, { m1: 2, m2: 1, total: 3 });
  assert.deepEqual(parsed.correctCounts.math, { m1: 1, m2: 1, total: 2 });

  const mathM2 = parsed.questions.filter((q) => q.subjectCode === 'MATH' && q.moduleNumber === 2);
  assert.equal(mathM2.length, 2);
});

test('status-only reports: isCorrect survives, the chosen answer does not', () => {
  const parsed = parseBluebookReport(fixture('report-status-only.html'));
  assert.deepEqual(parsed.correctCounts.rw, { m1: 1, m2: 1, total: 2 });

  const wrong = parsed.questions.find((q) => !q.isCorrect && q.subjectCode === 'RW');
  assert.equal(wrong.synthesized, true);
  assert.notEqual(
    wrong.studentAnswer,
    wrong.correctAnswer,
    'a placeholder for a wrong answer must not equal the key',
  );

  // The whole point: a synthesized letter never reaches the stored
  // response vector, where it would read as real distractor data.
  const vector = toResponseVector(parsed);
  for (const entries of Object.values(vector)) {
    for (const entry of Object.values(entries)) {
      assert.equal(entry.chosen, undefined);
    }
  }
});

test('parsing is deterministic — the stored artifact re-parses identically', () => {
  // Re-parseability is why the raw HTML is kept at all. The original
  // parser picked wrong-answer placeholders at random, so this held only
  // by luck.
  const html = fixture('report-status-only.html');
  const a = parseBluebookReport(html);
  const b = parseBluebookReport(html);
  assert.deepEqual(b, a);
  assert.deepEqual(toResponseVector(b), toResponseVector(a));
});

test('toResponseVector matches what the validation trigger checksums', () => {
  const parsed = parseBluebookReport(fixture('report-new-format.html'));
  const vector = toResponseVector(parsed);

  assert.deepEqual(Object.keys(vector).sort(), ['MATH1', 'MATH2', 'RW1', 'RW2']);
  assert.deepEqual(Object.keys(vector.RW1).sort(), ['1', '2', '3']);

  // The trigger raises unless the correct count in each module's vector
  // equals the declared column, so these two must agree by construction.
  const countCorrect = (key) =>
    Object.values(vector[key]).filter((e) => e.correct).length;
  assert.equal(countCorrect('RW1'), parsed.correctCounts.rw.m1);
  assert.equal(countCorrect('RW2'), parsed.correctCounts.rw.m2);
  assert.equal(countCorrect('MATH1'), parsed.correctCounts.math.m1);
  assert.equal(countCorrect('MATH2'), parsed.correctCounts.math.m2);

  // Real distractors are carried; correct answers never are.
  assert.equal(vector.RW1['2'].chosen, 'A');
  assert.equal(vector.RW1['1'].chosen, undefined);
});

test('moduleKey clamps to the four keys the schema allows', () => {
  assert.equal(moduleKey('RW', 1), 'RW1');
  assert.equal(moduleKey('RW', 2), 'RW2');
  assert.equal(moduleKey('MATH', 1), 'MATH1');
  assert.equal(moduleKey('MATH', 2), 'MATH2');
});

test('computeModuleStats reports correct-of-total per module', () => {
  const stats = computeModuleStats(parseBluebookReport(fixture('report-new-format.html')));
  assert.deepEqual(stats['RW/1'], { subjectCode: 'RW', moduleNumber: 1, correct: 2, total: 3 });
  assert.deepEqual(stats['MATH/2'], { subjectCode: 'MATH', moduleNumber: 2, correct: 2, total: 3 });
});

test('unusable input fails loudly rather than yielding an empty report', () => {
  assert.throws(() => parseBluebookReport(''), BluebookParseError);
  assert.throws(() => parseBluebookReport('   '), BluebookParseError);

  // A well-formed page that simply isn't a Bluebook export. Silently
  // returning zero questions here would let a contributor submit an
  // empty vector that passes every downstream count check.
  assert.throws(
    () => parseBluebookReport('<html><head><title>Hello</title></head><body><p>hi</p></body></html>'),
    (err) => err instanceof BluebookParseError && /Could not read any questions/.test(err.message),
  );

  assert.throws(
    () => parseBluebookReport(`<html><body>${'x'.repeat(11 * 1024 * 1024)}</body></html>`),
    (err) => err instanceof BluebookParseError && /10MB/.test(err.message),
  );
});

test('script and event-handler content is data, never executed or echoed', () => {
  // The artifact is hostile input. The parser must read a doctored file
  // without evaluating anything in it, and must not surface markup that
  // a caller could be tempted to render.
  const hostile = `<!doctype html>
    <html><head><title>MyPractice - SAT Practice 9 - May 1, 2026 - Details</title>
    <script>globalThis.__bluebook_pwned = true;</script></head>
    <body onload="globalThis.__bluebook_pwned = true">
    <table><tbody>
      <tr data-tr="0" class="table-row reading-and-writing module-1">
        <th>1</th><td>Reading and Writing</td><td><div>B</div></td>
        <td><p class="correct">B; Correct</p></td><td></td><td>Information and Ideas</td>
      </tr>
    </tbody></table></body></html>`;

  const parsed = parseBluebookReport(hostile);
  assert.equal(globalThis.__bluebook_pwned, undefined, 'nothing in the file ran');
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.correctCounts.rw.m1, 1);

  const serialized = JSON.stringify(parsed);
  assert.ok(!serialized.includes('<script'), 'no markup rides along in the parse result');
  assert.ok(!serialized.includes('onload'));
});
