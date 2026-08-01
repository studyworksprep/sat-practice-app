import test from 'node:test';
import assert from 'node:assert/strict';

import { skillDisplayName, planTaskTitle } from './task-labels.ts';

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
