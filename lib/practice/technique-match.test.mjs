import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionByTechnique } from './technique-match.ts';

const Q = [
  { id: 'q1', skill_code: 'H.A.' },
  { id: 'q2', skill_code: 'H.A.' },
  { id: 'q3', skill_code: 'S.B.' },
  { id: 'q4', skill_code: null },
];

test('no techniques → nothing matches, order kept', () => {
  const out = partitionByTechnique(Q, { techniqueIds: [], tagged: [], defaults: [] });
  assert.deepEqual(out.matching, []);
  assert.deepEqual(out.rest.map((q) => q.id), ['q1', 'q2', 'q3', 'q4']);
});

test('explicit tags and default skills both count; other techniques are ignored', () => {
  const out = partitionByTechnique(Q, {
    techniqueIds: ['regression'],
    tagged: [
      { question_id: 'q3', technique_id: 'regression' },
      { question_id: 'q2', technique_id: 'graphing' }, // not in play
    ],
    defaults: [
      { technique_id: 'regression', skill_code: 'H.A.' },
      { technique_id: 'graphing', skill_code: 'S.B.' }, // not in play
    ],
  });
  assert.deepEqual(out.matching.map((q) => q.id), ['q1', 'q2', 'q3']);
  assert.deepEqual(out.rest.map((q) => q.id), ['q4']);
});

test('a question tagged twice appears once', () => {
  const out = partitionByTechnique(Q, {
    techniqueIds: ['a', 'b'],
    tagged: [
      { question_id: 'q4', technique_id: 'a' },
      { question_id: 'q4', technique_id: 'b' },
    ],
    defaults: [],
  });
  assert.deepEqual(out.matching.map((q) => q.id), ['q4']);
  assert.equal(out.rest.length, 3);
});
