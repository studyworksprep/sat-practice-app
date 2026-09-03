import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatNumericCheckAnswer,
  gradeNumericCheck,
  isNumericCheck,
  numericCheckAnswers,
  numericCheckCorrectAnswer,
  validateNumericCheckContent,
} from './numeric-check.mjs';

const base = { input: 'numeric', prompt: 'What is the value of \\(f(3)\\)?', answer: '4' };

test('isNumericCheck keys on input: "numeric" only', () => {
  assert.equal(isNumericCheck(base), true);
  assert.equal(isNumericCheck({ choices: ['a', 'b'], correct_index: 0 }), false);
  assert.equal(isNumericCheck({ input: 'choice' }), false);
  assert.equal(isNumericCheck(null), false);
});

test('answers list keyed answer first, then accept, deduped and trimmed', () => {
  const c = { ...base, answer: ' 25/2 ', accept: ['12.5', '25/2', 12.5, ''] };
  assert.deepEqual(numericCheckAnswers(c), ['25/2', '12.5']);
  assert.equal(formatNumericCheckAnswer(c), '25/2 or 12.5');
  assert.equal(formatNumericCheckAnswer({ input: 'numeric' }), '—');
});

test('builds the bank correct_answer shape the shared grader consumes', () => {
  assert.deepEqual(numericCheckCorrectAnswer({ ...base, answer: '25/2', accept: ['12.5'] }), {
    text: '["25/2","12.5"]',
    number: 12.5,
  });
  assert.deepEqual(numericCheckCorrectAnswer({ ...base, answer: 1.333, tolerance: 0.001 }), {
    text: '["1.333"]',
    number: 1.333,
    tolerance: 0.001,
  });
  // A negative tolerance is not carried — the validator rejects it.
  assert.deepEqual(numericCheckCorrectAnswer({ ...base, tolerance: -1 }), {
    text: '["4"]',
    number: 4,
  });
});

test('grades fractions and decimals as equivalent, like the bank', () => {
  const c = { ...base, answer: '27/48', accept: ['9/16'] };
  assert.equal(gradeNumericCheck(c, '27/48'), true);   // text
  assert.equal(gradeNumericCheck(c, '9/16'), true);    // text (accept)
  assert.equal(gradeNumericCheck(c, '.5625'), true);   // numeric
  assert.equal(gradeNumericCheck(c, '0.5625'), true);
  assert.equal(gradeNumericCheck(c, '27/45'), false);  // the trap answer
  assert.equal(gradeNumericCheck(c, ''), false);
  assert.equal(gradeNumericCheck(c, null), false);
});

test('tolerance admits rounded or truncated decimals', () => {
  const c = { ...base, answer: '4/3', tolerance: 0.001 };
  assert.equal(gradeNumericCheck(c, '1.333'), true);
  assert.equal(gradeNumericCheck(c, '1.3333'), true);
  assert.equal(gradeNumericCheck(c, '1.3'), false);
  assert.equal(gradeNumericCheck({ ...base, answer: '4/3' }, '1.333'), false); // no tolerance
});

test('negative answers and a numeric answer field', () => {
  assert.equal(gradeNumericCheck({ ...base, answer: -12 }, '-12'), true);
  assert.equal(gradeNumericCheck({ ...base, answer: -12 }, '12'), false);
  assert.equal(gradeNumericCheck({ ...base, answer: '-12' }, '-24/2'), true);
});

test('validation: a good numeric check has no problems', () => {
  assert.deepEqual(validateNumericCheckContent(base), []);
  assert.deepEqual(
    validateNumericCheckContent({ ...base, answer: '39/65', accept: ['3/5', '.6'], tolerance: 0 }),
    [],
  );
});

test('validation: missing or untypeable answers', () => {
  assert.match(validateNumericCheckContent({ input: 'numeric' })[0], /answer is required/);
  assert.match(
    validateNumericCheckContent({ ...base, answer: '\\frac{1}{2}' })[0],
    /not a number the learner could type/,
  );
  assert.match(validateNumericCheckContent({ ...base, answer: '50%' })[0], /not a number/);
});

test('validation: accept entries, tolerance, and stray choices', () => {
  assert.match(validateNumericCheckContent({ ...base, accept: '12.5' })[0], /accept must be an array/);
  assert.match(validateNumericCheckContent({ ...base, accept: ['x'] })[0], /accept entry "x"/);
  assert.match(validateNumericCheckContent({ ...base, tolerance: -0.1 })[0], /tolerance must be/);
  assert.match(validateNumericCheckContent({ ...base, tolerance: '0.1' })[0], /tolerance must be/);
  assert.match(
    validateNumericCheckContent({ ...base, choices: ['4', '5'], correct_index: 0 })[0],
    /carries no choices/,
  );
  assert.match(validateNumericCheckContent({ ...base, correct_index: 0 })[0], /carries no correct_index/);
});
