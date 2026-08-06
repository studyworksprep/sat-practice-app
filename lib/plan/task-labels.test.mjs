import test from 'node:test';
import assert from 'node:assert/strict';

import { skillDisplayName, planTaskTitle, planTaskWhy, renderDrillWhy } from './task-labels.ts';

test('skillDisplayName resolves SAT codes to full names', () => {
  assert.equal(skillDisplayName('H', 'H.A.'), 'Linear equations in one variable');
});

test('skillDisplayName falls back to codes for unknown tuples', () => {
  assert.equal(skillDisplayName('CAS', 'NOPE'), 'CAS/NOPE');
  assert.equal(skillDisplayName(null, null), 'Skill');
});

test('planTaskTitle upgrades legacy code titles from the payload codes', () => {
  const payload = { title: 'Drill: H/H.A.', domain_code: 'H', skill_code: 'H.A.' };
  assert.equal(planTaskTitle('drill', payload), 'Drill: Linear equations in one variable');
  const lesson = { title: 'Lesson: H/H.B.', domain_code: 'H', skill_code: 'H.B.' };
  assert.equal(planTaskTitle('lesson', lesson), 'Lesson: Linear functions');
});

test('planTaskTitle keeps hand-typed tutor titles verbatim', () => {
  const payload = { title: 'Extra quadratics practice', domain_code: 'H', skill_code: 'H.A.' };
  assert.equal(planTaskTitle('drill', payload), 'Extra quadratics practice');
});

test('planTaskTitle keeps stored titles when codes are absent', () => {
  assert.equal(planTaskTitle('drill', { title: 'Drill: H.A.' }), 'Drill: H.A.');
});

test('planTaskTitle falls back by task type', () => {
  assert.equal(planTaskTitle('full_test', {}), 'Full-length practice test');
  assert.equal(planTaskTitle('review', { title: '  ' }), 'Spaced review');
  assert.equal(planTaskTitle('mystery', null), 'Study task');
});

// ── why-this copy ────────────────────────────────────────────────

test('renderDrillWhy names the question count for low-evidence skills', () => {
  assert.equal(
    renderDrillWhy('low_evidence', 3),
    'Only 3 questions so far — this drill fills in the picture',
  );
  assert.match(renderDrillWhy('low_evidence', 1), /Only 1 question so far/);
  assert.match(renderDrillWhy('low_evidence', 0), /No questions here yet/);
});

test('planTaskWhy prefers the stored reason code over the stored sentence', () => {
  const payload = { why: 'stale sentence', why_code: 'near_threshold', why_attempts: 12 };
  assert.equal(planTaskWhy(payload), 'Nearly there — a few clean reps will lock it in');
});

test('planTaskWhy upgrades the legacy headroom phrasing by magnitude', () => {
  assert.equal(
    planTaskWhy({ why: '~9 points of headroom to mastery' }),
    'Close to solid — one more pass should do it',
  );
  assert.equal(
    planTaskWhy({ why: '~27 points of headroom to mastery' }),
    'Still building — worth another pass',
  );
  assert.equal(
    planTaskWhy({ why: '~54 points of headroom to mastery' }),
    'Early days on this skill — more practice will show where you stand',
  );
});

test('planTaskWhy never leaks "headroom" or a point count to the reader', () => {
  for (const headroom of [2, 10, 11, 30, 31, 80]) {
    const out = planTaskWhy({ why: `~${headroom} points of headroom to mastery` });
    assert.doesNotMatch(out, /headroom|points/i, `leaked at ${headroom}`);
  }
});

test('planTaskWhy keeps hand-authored tutor reasons verbatim', () => {
  assert.equal(planTaskWhy({ why: 'Added by your tutor' }), 'Added by your tutor');
  assert.equal(
    planTaskWhy({ why: 'We talked about this — 30 points of headroom left on the SAT' }),
    'We talked about this — 30 points of headroom left on the SAT',
  );
});

test('planTaskWhy ignores an unrecognised code and returns null for nothing', () => {
  assert.equal(planTaskWhy({ why: 'kept', why_code: 'not_a_code' }), 'kept');
  assert.equal(planTaskWhy({}), null);
  assert.equal(planTaskWhy(null), null);
});
