// Shared-vector unit tests for the mastery formula (upgrade plan §1.1).
//
// masteryFromAggregates here and public.compute_mastery_score in SQL
// (migration 20260713120000) are two implementations of one formula.
// Both are pinned to lib/mastery.fixtures.json: this test asserts the JS
// side; the migration's fixture query asserts the SQL side. If they ever
// disagree, one of the two drifted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { masteryFromAggregates, masteryWeight, computeMastery } from './mastery.ts';

const fixtures = JSON.parse(
  readFileSync(new URL('./mastery.fixtures.json', import.meta.url), 'utf8'),
);

test('masteryFromAggregates matches the shared vector (pinned to SQL compute_mastery_score)', () => {
  for (const c of fixtures.cases) {
    const got = masteryFromAggregates(c);
    assert.equal(got, c.expected, `${c.name}: got ${got}, expected ${c.expected}`);
  }
});

test('masteryWeight applies difficulty × band weights with documented fallbacks', () => {
  assert.equal(masteryWeight(1, 3), 0.6 * 1.0);
  assert.equal(masteryWeight(3, 7), 1.5 * 1.7);
  assert.equal(masteryWeight(2, 5), 1.0 * 1.3);
  assert.equal(masteryWeight(null, null), 1.0 * 1.15); // null → fallbacks
  assert.equal(masteryWeight(9, 9), 1.0 * 1.15); // out-of-range → fallbacks
});

test('computeMastery returns null on empty input and caps at 100', () => {
  assert.equal(computeMastery([], {}), null);
  const attempts = Array.from({ length: 200 }, (_, i) => ({
    question_id: `q${i}`,
    is_correct: true,
    created_at: new Date().toISOString(),
  }));
  const taxMap = Object.fromEntries(
    attempts.map((a) => [a.question_id, { difficulty: 2, score_band: 3 }]),
  );
  assert.equal(computeMastery(attempts, taxMap), 100);
});

test('hint-assisted corrects score half weight (§3.2), wrong answers unaffected', () => {
  const taxMap = {
    q1: { difficulty: 2, score_band: 3 },
    q2: { difficulty: 2, score_band: 3 },
  };
  const at = (over) => ({
    question_id: 'q1',
    is_correct: true,
    created_at: new Date().toISOString(),
    ...over,
  });
  // Same two questions; one run unassisted, one with hints on q2.
  const unassisted = computeMastery(
    [at({}), at({ question_id: 'q2' })],
    taxMap,
  );
  const assisted = computeMastery(
    [at({}), at({ question_id: 'q2', hints_used: 2 })],
    taxMap,
  );
  assert.ok(assisted < unassisted, `expected ${assisted} < ${unassisted}`);

  // hints_used on a WRONG answer changes nothing (already 0 credit).
  const wrongPlain = computeMastery(
    [at({}), at({ question_id: 'q2', is_correct: false })],
    taxMap,
  );
  const wrongHinted = computeMastery(
    [at({}), at({ question_id: 'q2', is_correct: false, hints_used: 3 })],
    taxMap,
  );
  assert.equal(wrongPlain, wrongHinted);

  // hints_used: 0 / null are unassisted.
  const zeroHints = computeMastery(
    [at({}), at({ question_id: 'q2', hints_used: 0 })],
    taxMap,
  );
  assert.equal(zeroHints, unassisted);
});
