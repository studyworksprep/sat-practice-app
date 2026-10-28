import assert from 'node:assert/strict';
import test from 'node:test';
import { buildActSectionRows } from './act-report.ts';

const questions = [
  { id: 'english-1', section: 'english', category: 'Conventions' },
  { id: 'math-1', section: 'math', category: 'Algebra' },
  { id: 'math-2', section: 'math', category: null },
];
const finished = '2026-10-18T15:00:00Z';

test('ACT report counts unanswered questions and preserves section/category labels', () => {
  const rows = buildActSectionRows(questions.map((question) => question.id), questions, [
    { question_id: 'math-1', is_correct: true, created_at: '2026-10-18T14:00:00Z', time_spent_ms: 5000 },
    { question_id: 'english-1', is_correct: false, created_at: '2026-10-18T14:00:00Z', time_spent_ms: 2000 },
  ], { math_scaled: 24 }, finished);
  assert.deepEqual(rows.map((row) => row.label), ['English', 'Math']);
  assert.deepEqual(rows[1].raw, { total: 2, correct: 1 });
  assert.equal(rows[1].attempted, 1);
  assert.equal(rows[1].timeMs, 5000);
  assert.equal(rows[1].scaled, 24);
  assert.equal(rows[0].scaled, null);
  assert.deepEqual(rows[1].categories, [
    { name: 'Algebra', total: 1, correct: 1 },
    { name: 'Uncategorized', total: 1, correct: 0 },
  ]);
});

test('later practice cannot fill an unanswered test question or replace its first answer', () => {
  const rows = buildActSectionRows(['math-1', 'math-2'], questions, [
    { question_id: 'math-2', is_correct: true, created_at: '2026-10-19T14:00:00Z', time_spent_ms: 8000 },
    { question_id: 'math-1', is_correct: true, created_at: '2026-10-18T14:30:00Z' },
    { question_id: 'math-1', is_correct: false, created_at: '2026-10-18T14:00:00Z', time_spent_ms: 3000 },
  ], {}, finished);
  assert.deepEqual(rows[0].raw, { total: 2, correct: 0 });
  assert.equal(rows[0].attempted, 1);
  assert.equal(rows[0].timeMs, 3000);
});

test('empty and single-section reports do not invent scores or sections', () => {
  assert.deepEqual(buildActSectionRows([], questions, [], {}, finished), []);
  const rows = buildActSectionRows(['math-1', 'math-1'], questions, [], { math_scaled: NaN }, finished);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].raw, { total: 1, correct: 0 });
  assert.equal(rows[0].scaled, null);
});

test('score summaries split higher math into its five subcategories alongside essential skills', () => {
  const subcategories = ['Number & Quantity', 'Algebra', 'Functions', 'Geometry', 'Statistics & Probability'];
  const questions = [
    ...subcategories.map((subcategory) => ({ id: subcategory, section: 'math', category: 'Preparing for Higher Math', subcategory })),
    { id: 'skipped-algebra', section: 'math', category: 'Preparing for Higher Math', subcategory: 'Algebra' },
    { id: 'IES', section: 'math', category: 'Integrating Essential Skills', subcategory: null },
    { id: 'english', section: 'english', category: 'Conventions', subcategory: 'Punctuation' },
  ];
  const rows = buildActSectionRows(questions.map((question) => question.id), questions, [
    { question_id: 'Algebra', is_correct: true, created_at: '2026-10-18T14:00:00Z' },
    { question_id: 'IES', is_correct: true, created_at: '2026-10-18T14:00:00Z' },
  ], {}, finished);
  assert.deepEqual(rows.find((row) => row.section === 'math').categories, [
    { name: 'Algebra', total: 2, correct: 1 },
    { name: 'Functions', total: 1, correct: 0 },
    { name: 'Geometry', total: 1, correct: 0 },
    { name: 'Integrating Essential Skills', total: 1, correct: 1 },
    { name: 'Number & Quantity', total: 1, correct: 0 },
    { name: 'Statistics & Probability', total: 1, correct: 0 },
  ]);
  assert.deepEqual(rows.find((row) => row.section === 'english').categories, [
    { name: 'Conventions', total: 1, correct: 0 },
  ]);
});
