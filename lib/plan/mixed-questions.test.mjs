import assert from 'node:assert/strict';
import test from 'node:test';
import { selectMixedQuestions } from './mixed-questions.ts';

function bank(skill, difficulty, n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${skill}-${difficulty}-${i}`, skill_code: skill, difficulty,
  }));
}

for (const skills of [['linear'], ['linear', 'nonlinear']]) {
  test(`balanced Week 1 set across ${skills.length} eligible skill(s)`, () => {
    const candidates = skills.flatMap(skill =>
      [1, 2, 3].flatMap(level => bank(skill, level, level === 1 ? 510 : 12)));
    const ids = selectMixedQuestions(candidates, 10, skills, new Set(), new Set());
    assert.equal(new Set(ids).size, 10);
    for (const skill of skills) {
      assert.equal(ids.filter(id => id.startsWith(skill + '-')).length, 10 / skills.length);
    }
    assert.deepEqual(ids.map(id => Number(id.split('-')[1])), [1,1,1,2,2,2,2,2,3,3]);
  });
}

test('redistributes a thin skill, uses fresh items and exhausts a short bank without duplicates', () => {
  const rows = [...bank('a', 1, 1), ...bank('b', 2, 4)];
  const answered = new Set([rows[1].id]);
  const ids = selectMixedQuestions(rows, 4, ['empty','a','b'], answered, new Set());
  assert.equal(ids.length, 4);
  assert.ok(ids.includes(rows[0].id));
  assert.ok(!ids.includes(rows[1].id));
  assert.equal(new Set(selectMixedQuestions(rows, 10, null, answered, new Set())).size, 5);
});
