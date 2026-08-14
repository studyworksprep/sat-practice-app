// Tutor-effectiveness rollup tests (§5.2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeEffectiveness,
  rollupAdherence,
  rollupCompletion,
  EMPTY_COMPLETION,
} from './effectiveness.ts';

const c = (teacherId, completedAt) => ({ teacherId, completedAt });

test('rollupCompletion counts assigned and completed per teacher', () => {
  const rows = [
    c('t1', '2026-08-01T00:00:00Z'),
    c('t1', null),
    c('t1', '2026-08-05T00:00:00Z'),
    c('t2', null),
  ];
  const byTeacher = rollupCompletion(rows);
  assert.deepEqual(byTeacher.get('t1'), {
    assigned: 3,
    completed: 2,
    rate: 2 / 3,
  });
  assert.deepEqual(byTeacher.get('t2'), { assigned: 1, completed: 0, rate: 0 });
});

test('rollupCompletion returns an empty map for no rows', () => {
  assert.equal(rollupCompletion([]).size, 0);
});

test('rollupAdherence buckets statuses and counts missing plans as noPlan', () => {
  const roster = new Map([
    ['t1', ['s1', 's2', 's3', 's4']],
    ['t2', ['s3']],
  ]);
  const statuses = new Map([
    ['s1', 'on_track'],
    ['s2', 'behind'],
    ['s3', 'ahead'],
    // s4 has no active plan
  ]);
  const byTeacher = rollupAdherence(roster, statuses);
  assert.deepEqual(byTeacher.get('t1'), {
    onTrack: 1,
    behind: 1,
    ahead: 1,
    notStarted: 0,
    noPlan: 1,
  });
  // A student on two rosters counts for both tutors.
  assert.deepEqual(byTeacher.get('t2'), {
    onTrack: 0,
    behind: 0,
    ahead: 1,
    notStarted: 0,
    noPlan: 0,
  });
});

test('rollupAdherence buckets not_started separately from noPlan', () => {
  const roster = new Map([['t1', ['s1']]]);
  const byTeacher = rollupAdherence(roster, new Map([['s1', 'not_started']]));
  assert.deepEqual(byTeacher.get('t1'), {
    onTrack: 0,
    behind: 0,
    ahead: 0,
    notStarted: 1,
    noPlan: 0,
  });
});

test('composeEffectiveness fills gaps with null movement and empty rollups', () => {
  const movement = new Map([
    [
      't1',
      {
        teacherId: 't1',
        studentsMeasured: 3,
        skillsWorked: 12,
        avgMasteryDelta: 7.4,
        avgMasteryNow: 41.2,
      },
    ],
  ]);
  const completion = new Map([['t1', { assigned: 2, completed: 1, rate: 0.5 }]]);
  const adherence = new Map();
  const result = composeEffectiveness(['t1', 't2'], movement, completion, adherence);

  assert.equal(result.get('t1').movement.avgMasteryDelta, 7.4);
  assert.equal(result.get('t1').completion.rate, 0.5);
  assert.deepEqual(result.get('t2'), {
    movement: null,
    completion: { ...EMPTY_COMPLETION },
    adherence: { onTrack: 0, behind: 0, ahead: 0, notStarted: 0, noPlan: 0 },
  });
});

test('composeEffectiveness does not share the EMPTY_COMPLETION object across teachers', () => {
  const result = composeEffectiveness(['t1', 't2'], new Map(), new Map(), new Map());
  result.get('t1').completion.assigned = 99;
  assert.equal(result.get('t2').completion.assigned, 0);
  assert.equal(EMPTY_COMPLETION.assigned, 0);
});
