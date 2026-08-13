import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerTokens, answersMatch, fingerprintParsedForm } from './scoring-study.ts';

test('stored MCQ and SPR answer shapes normalize to report tokens', () => {
  assert.deepEqual(answerTokens({ option_label: 'c' }), ['C']);
  assert.deepEqual(answerTokens({ text: '["77", "77.0"]', number: 77 }), ['77']);
  assert.equal(answersMatch('30, -30', { text: '["-30", "30"]' }), true);
  assert.equal(answersMatch('B', { option_label: 'D' }), false);
});

test('form fingerprints are stable but respond to an answer-key change', () => {
  const base = {
    questions: [
      {
        subjectCode: 'RW', moduleNumber: 1, ordinal: 1,
        questionType: 'mcq', correctAnswer: 'B', domain: 'Information and Ideas',
      },
      {
        subjectCode: 'MATH', moduleNumber: 2, ordinal: 1,
        questionType: 'spr', correctAnswer: '17', domain: 'Algebra',
      },
    ],
  };
  const reordered = { questions: [base.questions[1], base.questions[0]] };
  const changed = {
    questions: base.questions.map((q, i) => (i === 0 ? { ...q, correctAnswer: 'C' } : q)),
  };

  assert.equal(fingerprintParsedForm(base), fingerprintParsedForm(reordered));
  assert.notEqual(fingerprintParsedForm(base), fingerprintParsedForm(changed));
});
