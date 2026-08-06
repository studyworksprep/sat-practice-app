// Unit tests for the flow-B cross-check.
//
// diffResponseVectors is what stands between a mis-keyed Bluebook entry
// and a permanently wrong calibration row, so its edge cases matter more
// than its happy path: a partially-covered test, a section the student
// skipped, an ordinal present on one side only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffResponseVectors } from './attempt-vector.ts';

const mod = (spec) =>
  Object.fromEntries(
    Object.entries(spec).map(([ordinal, correct]) => [ordinal, { correct }]),
  );

test('identical vectors agree', () => {
  const v = { RW1: mod({ 1: true, 2: false, 3: true }) };
  const diff = diffResponseVectors(v, { RW1: mod({ 1: true, 2: false, 3: true }) });

  assert.equal(diff.matches, true);
  assert.equal(diff.compared, 3);
  assert.deepEqual(diff.disagreements, []);
});

test('a single mis-keyed answer is located precisely', () => {
  const attempt = { RW1: mod({ 1: true, 2: true, 3: false }) };
  const report = { RW1: mod({ 1: true, 2: false, 3: false }) };
  const diff = diffResponseVectors(attempt, report);

  assert.equal(diff.matches, false);
  assert.equal(diff.compared, 3, 'every shared question is still compared');
  assert.deepEqual(diff.disagreements, [
    { module: 'RW1', ordinal: 2, attempt: true, report: false },
  ]);
});

test('the chosen answer is not compared — only correctness', () => {
  // Reports often omit what the student picked, and the parser
  // synthesizes a placeholder in that case. Comparing `chosen` would
  // manufacture disagreements out of that placeholder.
  const attempt = { MATH1: { 1: { correct: false, chosen: 'B' } } };
  const report = { MATH1: { 1: { correct: false, chosen: 'D' } } };

  assert.equal(diffResponseVectors(attempt, report).matches, true);
});

test('a module on one side only is reported as coverage, not conflict', () => {
  // An RW-only attempt against a full report is normal and should not
  // read as "51 questions disagree".
  const attempt = { RW1: mod({ 1: true }), RW2: mod({ 1: true }) };
  const report = {
    RW1: mod({ 1: true }),
    RW2: mod({ 1: true }),
    MATH1: mod({ 1: true, 2: false }),
    MATH2: mod({ 1: true }),
  };
  const diff = diffResponseVectors(attempt, report);

  assert.equal(diff.matches, true);
  assert.deepEqual(diff.modulesOnlyInReport, ['MATH1', 'MATH2']);
  assert.deepEqual(diff.modulesOnlyInAttempt, []);
  assert.equal(diff.compared, 2);
});

test('a missing ordinal inside a shared module IS a conflict', () => {
  // Both sides claim to cover this module, so a question one of them
  // doesn't know about means the module contents disagree — a different
  // failure from "this section wasn't taken", and worth surfacing.
  const attempt = { RW1: mod({ 1: true, 2: true }) };
  const report = { RW1: mod({ 1: true }) };
  const diff = diffResponseVectors(attempt, report);

  assert.equal(diff.matches, false);
  assert.deepEqual(diff.disagreements, [
    { module: 'RW1', ordinal: 2, attempt: true, report: null },
  ]);
});

test('disagreements come back in question order', () => {
  const attempt = { RW1: mod({ 1: false, 2: false, 10: false, 3: false }) };
  const report = { RW1: mod({ 1: true, 2: true, 10: true, 3: true }) };
  const diff = diffResponseVectors(attempt, report);

  assert.deepEqual(
    diff.disagreements.map((d) => d.ordinal),
    [1, 2, 3, 10],
    'numeric order, not the lexicographic order of the JSON keys',
  );
});

test('empty vectors on both sides agree vacuously', () => {
  const diff = diffResponseVectors({}, {});
  assert.equal(diff.matches, true);
  assert.equal(diff.compared, 0);
});

test('all four modules are walked', () => {
  const full = {
    RW1: mod({ 1: true }),
    RW2: mod({ 1: true }),
    MATH1: mod({ 1: true }),
    MATH2: mod({ 1: false }),
  };
  const broken = {
    RW1: mod({ 1: true }),
    RW2: mod({ 1: false }),
    MATH1: mod({ 1: true }),
    MATH2: mod({ 1: true }),
  };
  const diff = diffResponseVectors(full, broken);

  assert.equal(diff.compared, 4);
  assert.deepEqual(
    diff.disagreements.map((d) => d.module).sort(),
    ['MATH2', 'RW2'],
  );
});
