import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPracticeSuggestions, MIN_SAMPLE } from './practice-suggestions.ts';

const DOMAINS = [
  { name: 'Algebra', section: 'math', skills: [
    { name: 'Linear equations in one variable', count: 40 },
    { name: 'Linear functions', count: 30 },
  ] },
  { name: 'Geometry and Trigonometry', section: 'math', skills: [
    { name: 'Circles', count: 25 },
    { name: 'Right triangles', count: 0 },
  ] },
  { name: 'Craft and Structure', section: 'rw', skills: [
    { name: 'Words in Context', count: 50 },
  ] },
];

const byId = (list) => Object.fromEntries(list.map((s) => [s.id, s]));

test('most-missed picks the weakest skill with a trustworthy sample', () => {
  const out = byId(buildPracticeSuggestions(DOMAINS, [
    { name: 'Linear equations in one variable', correct: 4, total: 353 },
    { name: 'Linear functions', correct: 0, total: MIN_SAMPLE - 1 }, // too few answers
    { name: 'Words in Context', correct: 9, total: 10 },             // not weak
  ]));
  assert.equal(out['most-missed'].title, 'Linear equations in one variable');
  assert.deepEqual(out['most-missed'].filters.skills, ['Linear equations in one variable']);
  assert.match(out['most-missed'].detail, /4 of 353/);
});

test('no most-missed card when nothing is both weak and well-sampled', () => {
  const out = byId(buildPracticeSuggestions(DOMAINS, [
    { name: 'Linear functions', correct: 1, total: 2 },
  ]));
  assert.equal(out['most-missed'], undefined);
});

test('not-tried picks the untried bank skill with the most questions, unattempted only', () => {
  const out = byId(buildPracticeSuggestions(DOMAINS, [
    { name: 'Words in Context', correct: 5, total: 6 },
    { name: 'Linear equations in one variable', correct: 4, total: 10 },
  ]));
  assert.equal(out['not-tried'].title, 'Linear functions');
  assert.equal(out['not-tried'].filters.unansweredOnly, true);
});

test('empty-bank skills are never suggested', () => {
  const out = buildPracticeSuggestions(DOMAINS, []);
  for (const s of out) assert.ok(!s.filters.skills.includes('Right triangles'));
});

test('warm-up targets the weaker section, Math when there is no data', () => {
  const none = byId(buildPracticeSuggestions(DOMAINS, []));
  assert.match(none['warm-up'].title, /Math/);
  assert.equal(none['warm-up'].filters.order, 'easy_first');

  const rwWeak = byId(buildPracticeSuggestions(DOMAINS, [
    { name: 'Linear functions', correct: 9, total: 10 },
    { name: 'Words in Context', correct: 2, total: 10 },
  ]));
  assert.match(rwWeak['warm-up'].title, /Reading & Writing/);
  assert.deepEqual(rwWeak['warm-up'].filters.skills, ['Words in Context']);
});

test('an empty bank yields no suggestions', () => {
  assert.deepEqual(buildPracticeSuggestions([], []), []);
});
