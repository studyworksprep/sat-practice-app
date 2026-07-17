// Unit tests for the SM-2-lite scheduler (§3.1). Runs under
// `npm run test:unit` (node --test); imports the .ts source directly
// like lib/plan/today.test.mjs does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSchedule, masteryToResult, isDue } from './schedule.ts';

const NOW = '2026-07-17T12:00:00.000Z';

function daysFromNow(iso) {
  return (new Date(iso).getTime() - new Date(NOW).getTime()) / 86_400_000;
}

test('first wrong answer enqueues at the 1-day lapse floor', () => {
  const s = nextSchedule(null, 'again', NOW);
  assert.equal(s.intervalDays, 1);
  assert.equal(s.lapses, 1);
  assert.equal(s.lastResult, 'again');
  assert.equal(s.ease, 2.3); // default 2.5 minus the lapse penalty
  assert.equal(daysFromNow(s.dueAtIso), 1);
  assert.equal(s.lastReviewedAtIso, NOW);
});

test('first correct sighting schedules a few days out', () => {
  const good = nextSchedule(null, 'good', NOW);
  assert.equal(good.intervalDays, 3);
  assert.equal(good.lapses, 0);
  assert.equal(good.ease, 2.5);

  const easy = nextSchedule(null, 'easy', NOW);
  assert.equal(easy.intervalDays, 5);
  assert.equal(easy.ease, 2.6);
});

test('correct reviews expand the interval by ease', () => {
  const prev = { intervalDays: 4, ease: 2.5, lapses: 1 };
  const s = nextSchedule(prev, 'good', NOW);
  assert.equal(s.intervalDays, 10); // round(4 * 2.5)
  assert.equal(s.ease, 2.5);
  assert.equal(s.lapses, 1); // lapses only count misses
  assert.equal(daysFromNow(s.dueAtIso), 10);
});

test('a lapse resets the interval and decays ease', () => {
  const prev = { intervalDays: 10, ease: 2.5, lapses: 2 };
  const s = nextSchedule(prev, 'again', NOW);
  assert.equal(s.intervalDays, 1);
  assert.equal(s.ease, 2.3);
  assert.equal(s.lapses, 3);
});

test('ease never drops below the 1.3 floor or exceeds the 3.0 cap', () => {
  let state = { intervalDays: 1, ease: 1.4, lapses: 0 };
  state = nextSchedule(state, 'again', NOW);
  assert.equal(state.ease, 1.3);
  state = nextSchedule(state, 'again', NOW);
  assert.equal(state.ease, 1.3);

  let up = { intervalDays: 5, ease: 2.95, lapses: 0 };
  up = nextSchedule(up, 'easy', NOW);
  assert.equal(up.ease, 3.0);
});

test('interval caps at the 30-day test-prep horizon', () => {
  const prev = { intervalDays: 25, ease: 2.5, lapses: 0 };
  assert.equal(nextSchedule(prev, 'good', NOW).intervalDays, 30);
  assert.equal(nextSchedule(prev, 'easy', NOW).intervalDays, 30);
});

test('easy grows faster than good and nudges ease up', () => {
  const prev = { intervalDays: 6, ease: 2.0, lapses: 0 };
  const good = nextSchedule(prev, 'good', NOW);
  const easy = nextSchedule(prev, 'easy', NOW);
  assert.equal(good.intervalDays, 12); // round(6 * 2.0)
  assert.equal(easy.intervalDays, 16); // round(6 * 2.0 * 1.3)
  assert.ok(easy.ease > good.ease);
});

test('flashcard mastery ratings map onto the three outcomes', () => {
  assert.equal(masteryToResult(0), 'again');
  assert.equal(masteryToResult(2), 'again');
  assert.equal(masteryToResult(3), 'good');
  assert.equal(masteryToResult(4), 'good');
  assert.equal(masteryToResult(5), 'easy');
});

test('isDue compares instants across Z and +00:00 offset formats', () => {
  assert.equal(isDue('2026-07-17T11:59:00+00:00', NOW), true);
  assert.equal(isDue(NOW, NOW), true);
  assert.equal(isDue('2026-07-18T00:00:00+00:00', NOW), false);
});
