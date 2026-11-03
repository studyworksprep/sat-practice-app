import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHistoryRow,
  groupRowsByDay,
  labelSession,
  GROUP_ASSIGNMENTS,
  GROUP_MIXED,
  GROUP_REVIEW,
} from './history-rows.ts';

const ctx = {
  domainOfSkill: new Map([
    ['Linear functions', 'Algebra'],
    ['Linear equations in one variable', 'Algebra'],
    ['Circles', 'Geometry and Trigonometry'],
  ]),
  assignmentTitles: new Map([['a1', 'Week 3 homework']]),
  actSectionLabel: (code) => ({ math: 'Math', reading: 'Reading' })[code] ?? code,
};

test('builder sets name the skill, the one domain, or a mix', () => {
  assert.deepEqual(labelSession({ skills: ['Linear functions'] }, ctx), { title: 'Linear functions', group: 'Algebra' });
  assert.deepEqual(
    labelSession({ skills: ['Linear functions', 'Linear equations in one variable'] }, ctx),
    { title: 'Algebra', group: 'Algebra' },
  );
  assert.deepEqual(
    labelSession({ skills: ['Linear functions', 'Circles'] }, ctx),
    { title: 'Algebra + 1 more', group: GROUP_MIXED },
  );
});

test('assignments, review drills and the empty case get their own labels', () => {
  assert.deepEqual(labelSession({ assignment_id: 'a1' }, ctx), { title: 'Assignment: Week 3 homework', group: GROUP_ASSIGNMENTS });
  assert.equal(labelSession({ assignment_id: 'zz' }, ctx).title, 'Assignment');
  assert.deepEqual(labelSession({ kind: 'skill', skill: 'Circles' }, ctx), { title: 'Review: Circles', group: GROUP_REVIEW });
  assert.equal(labelSession({ kind: 'weak_queue' }, ctx).group, GROUP_REVIEW);
  assert.equal(labelSession({ explicit: true }, ctx).title, 'Hand-picked questions');
  assert.deepEqual(labelSession(null, ctx), { title: 'Mixed practice', group: GROUP_MIXED });
});

test('ACT sets label by category or section', () => {
  assert.deepEqual(labelSession({ sections: ['math'], categories: [] }, ctx), { title: 'Math', group: 'Math' });
  assert.deepEqual(labelSession({ sections: ['reading'], categories: ['Key Ideas and Details'] }, ctx), { title: 'Key Ideas and Details', group: 'Reading' });
});

test('row counts first in-window attempts only', () => {
  const row = buildHistoryRow(
    { id: 's', created_at: '2026-11-03T14:00:00Z', question_ids: ['q1', 'q2', 'q3'], current_position: 9, status: 'in_progress', filter_criteria: null },
    [
      { question_id: 'q1', is_correct: true, created_at: '2026-11-03T13:00:00Z' }, // before the session
      { question_id: 'q1', is_correct: false, created_at: '2026-11-03T14:01:00Z' },
      { question_id: 'q1', is_correct: true, created_at: '2026-11-03T14:02:00Z' }, // not the first
      { question_id: 'q2', is_correct: true, created_at: '2026-11-03T14:03:00Z' },
    ],
    { title: 't', group: 'g' },
  );
  assert.equal(row.attempted, 2);
  assert.equal(row.correct, 1);
  assert.equal(row.completed, false);
  assert.equal(row.resumePosition, 2);
});

test('rows group by New York day with Today / Yesterday headings', () => {
  const mk = (id, createdAt, correct) => ({
    id, createdAt, total: 1, attempted: 1, correct, completed: true, accuracyPct: correct * 100, resumePosition: 0,
    label: { title: 't', group: 'g' },
  });
  const now = new Date('2026-11-03T15:00:00Z'); // 10 AM in New York
  const groups = groupRowsByDay([
    mk('a', '2026-11-03T14:00:00Z', 1),
    mk('b', '2026-11-03T04:30:00Z', 0), // 11:30 PM Nov 2 in New York
    mk('c', '2026-11-02T12:00:00Z', 1),
    mk('d', '2026-10-27T12:00:00Z', 0),
  ], now);
  assert.deepEqual(groups.map((g) => g.heading), ['Today', 'Yesterday', 'Tue, Oct 27']);
  assert.deepEqual(groups[1].rows.map((r) => r.id), ['b', 'c']);
  assert.equal(groups[1].correct, 1);
});
