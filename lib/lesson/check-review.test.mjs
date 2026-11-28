import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCheckReview, calculatorSubmission, reviewQuestions } from './check-review.mjs';
import { applyCheckAttempt, checkFirstTryCorrect } from './runtime-progress.mjs';

const blocks = [
  { id: 'intro', block_type: 'text', content: { shared_prompt: { id: 'p', title: 'Passage', html: '<p>Read this.</p>' } } },
  { id: 'q', block_type: 'check', content: { prompt: 'Which side?', choices: ['AB', 'BC'], correct_index: 1,
    figure: { src: '/diagram.svg', alt: 'Triangle' }, shared_prompt: 'p' } },
  { id: 'n', block_type: 'check', content: { input: 'numeric', prompt: 'Value?', answer: '0.5' } },
];
const question = reviewQuestions(blocks).get('q');

test('a retry keeps the delivered choices, shared passage and figure after edits or removal', () => {
  const a = { selected: 0, correct: false, question, version: 'v1', id: 'a' };
  const b = { ...a, selected: 1, correct: true, id: 'b' };
  const first = applyCheckAttempt(null, a);
  const final = applyCheckAttempt(first, b);
  assert.equal(applyCheckAttempt(final, a), final);
  assert.equal(final.attempts[1].question, undefined);
  const changed = blocks.map(block => block.id === 'q' ? { ...block, content: { prompt: 'Edited', choices: ['X', 'Y'] } } : block);
  for (const row of [buildCheckReview(changed, { q: final }).rows[0], buildCheckReview([], { q: final }).archived[0]]) {
    assert.equal(row.outcome, 'retry');
    assert.equal(row.question.prompt, 'Which side?');
    assert.equal(row.question.passage.html, '<p>Read this.</p>');
    assert.equal(row.question.figure.alt, 'Triangle');
    assert.deepEqual(row.versions[0].answers.map(a => row.question.choices[a.selected]), ['AB','BC']);
  }
  const revised = applyCheckAttempt(first, { ...b, version: 'v2', question: reviewQuestions(changed).get('q') });
  assert.deepEqual(buildCheckReview(changed, { q: revised }).rows[0].versions.map(v => v.question.choices), [['AB','BC'], ['X','Y']]);
});

test('legacy results and unknown intermediate outcomes remain distinct from tracked responses', () => {
  const row = buildCheckReview(blocks, { q: { selected: 1, correct: true } }).rows[0];
  assert.equal(row.outcome, 'recorded');
  assert.equal(row.versions[0].answers[0].label, 'Last recorded answer');
  assert.equal(row.versions[0].saved, false);
  assert.equal(checkFirstTryCorrect({ first_try_correct: true, attempts: [{ at: null }, { at: 't' }] }), null);
  const entry = { correct: true, first_try_correct: false, attempts: [{ selected: 1, at: 't1' }, { selected: 0, at: 't2' }, { selected: 1, at: 't3' }] };
  assert.deepEqual(buildCheckReview(blocks, { q: entry }).rows[0].versions[0].answers.map(a => a.correct), [false, null, true]);
});

test('numeric submissions preserve typed fractions and explicit solution reveals', () => {
  const q = reviewQuestions(blocks).get('n');
  const e = applyCheckAttempt(null, { selected: '2/4', correct: true, question: q, version: 'v' });
  const n = buildCheckReview(blocks, { n: e }).rows[1];
  assert.equal(n.versions[0].answers[0].selected, '2/4');
  assert.equal(n.question.numericAnswer, '0.5');
  const miss = applyCheckAttempt(null, { selected: '0', correct: false, revealed: true });
  assert.equal(buildCheckReview(blocks, { n: miss }).rows[1].versions[0].answers[0].revealed, true);
});

test('Desmos attempts retain the submitted list, table cells and fitted parameter values', () => {
  const expressions = calculatorSubmission([{ latex: 'y=2x' }, { type: 'table', columns: [{ latex: 'x_1', values: ['1','2'] }] },
    { latex: 'y_1~ax_1', regressionParameters: { a: 2 } }]);
  assert.deepEqual(expressions, ['y=2x', 'x_1 | 1 | 2', 'y_1~ax_1', 'a = 2']);
  const graph = { id: 'd', block_type: 'desmos_interactive', content: { title: 'Graph a line' } };
  const row = buildCheckReview([graph], { d: applyCheckAttempt(null, { expressions, correct: true, type: 'desmos_interactive' }) }).rows[0];
  assert.deepEqual(row.versions[0].answers[0].expressions, expressions);
});
