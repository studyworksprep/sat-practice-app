// Manager team view: who is worth a check-in, and why.

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInNote, checkInWeight, needsCheckIn } from './team-checkin.ts';

const row = (over) => ({
  id: 't', name: 'Teacher', students: 4, practicedThisWeek: 3, plansBehind: 0, overdue: 0, idleStudent: null,
  ...over,
});

test('half or more practicing and five or fewer overdue is not flagged', () => {
  assert.equal(needsCheckIn(row({ practicedThisWeek: 2 })), false, 'exactly half is fine');
  assert.equal(needsCheckIn(row({ overdue: 5 })), false);
  assert.equal(needsCheckIn(row({ students: 0, practicedThisWeek: 0 })), false, 'an empty roster is not a problem');
});

test('fewer than half practicing, or more than five overdue, flags the teacher', () => {
  assert.equal(needsCheckIn(row({ practicedThisWeek: 1 })), true);
  assert.equal(needsCheckIn(row({ overdue: 6 })), true);
});

test('flagged teachers sort first', () => {
  const flagged = row({ practicedThisWeek: 0 });
  const busy = row({ overdue: 5, plansBehind: 3 });
  assert.ok(checkInWeight(flagged) > checkInWeight(busy));
});

test('the note reads as one or two plain sentences', () => {
  assert.equal(
    checkInNote(row({ students: 3, practicedThisWeek: 1, plansBehind: 2, overdue: 7, idleStudent: { name: 'Stu Three', days: 12 } })),
    'Only 1 of 3 students practiced this week, 2 of 3 are behind their plan and 7 assignments are past due. Stu Three hasn\'t practiced in 12 days.',
  );
  assert.equal(checkInNote(row({ students: 2, practicedThisWeek: 0 })), 'None of 2 students practiced this week.');
  assert.equal(checkInNote(row({ overdue: 1 })), '1 assignment is past due.');
  assert.equal(checkInNote(row({ idleStudent: { name: 'Ana', days: 3 } })), '', 'a short break is not worth mentioning');
});
