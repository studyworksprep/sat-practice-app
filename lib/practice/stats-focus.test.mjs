import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatsTab, pickFocusSkills, FOCUS_MIN_SAMPLE } from './stats-focus.ts';

test('parseStatsTab accepts known tabs and falls back to overview', () => {
  assert.equal(parseStatsTab('skills'), 'skills');
  assert.equal(parseStatsTab(['trend', 'skills']), 'trend');
  assert.equal(parseStatsTab('nope'), 'overview');
  assert.equal(parseStatsTab(undefined), 'overview');
});

test('focus is the weakest well-sampled skills, capped at the limit', () => {
  const { focus } = pickFocusSkills([
    { name: 'A', group: 'Algebra', correct: 9, total: 10 },
    { name: 'B', group: 'Algebra', correct: 1, total: 10 },
    { name: 'C', group: 'Geometry', correct: 5, total: 10 },
    { name: 'D', group: 'Geometry', correct: 7, total: 10 },
  ]);
  assert.deepEqual(focus.map((f) => f.name), ['B', 'C', 'D']);
  assert.equal(focus[0].pct, 10);
});

test('thin skills are held out of the ranking, never-answered ones dropped', () => {
  const { focus, thin } = pickFocusSkills([
    { name: 'Thin', group: 'Algebra', correct: 0, total: FOCUS_MIN_SAMPLE - 1 },
    { name: 'Thinner', group: 'Algebra', correct: 0, total: 1 },
    { name: 'Never', group: 'Algebra', correct: 0, total: 0 },
    { name: 'Solid', group: 'Algebra', correct: 8, total: 10 },
  ]);
  assert.deepEqual(focus.map((f) => f.name), ['Solid']);
  assert.deepEqual(thin.map((t) => t.name), ['Thin', 'Thinner']);
});

test('ties on accuracy put the larger sample first', () => {
  const { focus } = pickFocusSkills([
    { name: 'Small', group: 'g', correct: 1, total: 5 },
    { name: 'Big', group: 'g', correct: 4, total: 20 },
  ]);
  assert.deepEqual(focus.map((f) => f.name), ['Big', 'Small']);
});
