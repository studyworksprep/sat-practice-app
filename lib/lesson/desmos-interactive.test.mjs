import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESMOS_INTERACTIVE_EXAMPLE_CONTENT,
  DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE,
  DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE,
  isLessonCompletionLocked,
  parseDesmosInteractiveContent,
  validateDesmosSubmission,
} from './desmos-interactive.mjs';

test('schema parsing accepts multi-expression compare and attempt feedback fields', () => {
  const parsed = parseDesmosInteractiveContent(structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE));
  assert.equal(parsed.goal.type, 'multi_expression');
  assert.equal(parsed.validation.mode, 'compare_expressions');
  assert.equal(Array.isArray(parsed.feedback.attempt_based_hints), true);
});

test('multi-expression compare succeeds when first two expressions are equivalent', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);
  const result = validateDesmosSubmission({
    content,
    studentExpressions: [
      { latex: 'y=(x+1)(x-3)', type: 'expression', hidden: false },
      { latex: 'y=x^2-2x-3', type: 'expression', hidden: false },
    ],
    evaluateAtX: (expr, x) => {
      const rhs = String(expr).split('=').pop().trim();
      if (rhs === '(x+1)(x-3)') return (x + 1) * (x - 3);
      if (rhs === 'x^2-2x-3') return (x ** 2) - (2 * x) - 3;
      return NaN;
    },
    attempts: 1,
  });

  assert.equal(result.success, true);
  assert.equal(result.feedbackType, 'success');
});

test('multi-expression compare fails when expressions are not comparable', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);
  const result = validateDesmosSubmission({
    content,
    studentExpressions: [
      { latex: 'y=(x+1)(x-3)', type: 'expression', hidden: false },
      { latex: 'y=x+9', type: 'expression', hidden: false },
    ],
    evaluateAtX: (expr, x) => {
      const rhs = String(expr).split('=').pop().trim();
      if (rhs === '(x+1)(x-3)') return (x + 1) * (x - 3);
      if (rhs === 'x+9') return x + 9;
      return NaN;
    },
    attempts: 1,
  });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'expressions_not_comparable');
});

test('missing second expression uses targeted hint for multi-expression goal', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);
  const result = validateDesmosSubmission({
    content,
    studentExpressions: [{ latex: 'y=(x+1)(x-3)', type: 'expression', hidden: false }],
    evaluateAtX: () => NaN,
    attempts: 1,
  });

  assert.equal(result.success, false);
  assert.equal(result.hintTrigger, 'missing_second_expression');
});

test('attempt thresholds escalate feedback and reveal solution after configured count', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);

  const attempt2 = validateDesmosSubmission({
    content,
    studentExpressions: [
      { latex: 'y=x', type: 'expression', hidden: false },
      { latex: 'y=x+1', type: 'expression', hidden: false },
    ],
    evaluateAtX: () => NaN,
    attempts: 2,
  });
  assert.equal(attempt2.feedbackType, 'attempt');
  assert.match(attempt2.feedbackHtml, /simplifying/i);

  const attempt4 = validateDesmosSubmission({
    content,
    studentExpressions: [
      { latex: 'y=x', type: 'expression', hidden: false },
      { latex: 'y=x+1', type: 'expression', hidden: false },
    ],
    evaluateAtX: () => NaN,
    attempts: 4,
  });
  assert.equal(typeof attempt4.solutionHtml, 'string');
  assert.match(attempt4.solutionHtml, /Correct setup/i);
});

test('targeted hints override attempt-based hints on same failed attempt', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);
  const result = validateDesmosSubmission({
    content,
    studentExpressions: [{ latex: 'y=x', type: 'expression', hidden: false }],
    evaluateAtX: () => NaN,
    attempts: 3,
  });

  assert.equal(result.feedbackType, 'targeted');
  assert.equal(result.hintTrigger, 'missing_second_expression');
});

test('slider default-value checks still fail and keep progression lock active', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE);
  const result = validateDesmosSubmission({
    content,
    studentExpressions: [
      { latex: '6X^2Y^2(X^6+2)', type: 'expression', hidden: false },
      { latex: 'X=1', type: 'expression', hidden: false, sliderBounds: { min: '0', max: '10' } },
      { latex: 'Y=1', type: 'expression', hidden: false, sliderBounds: { min: '0', max: '10' } },
    ],
    evaluateAtX: () => NaN,
    attempts: 1,
  });
  assert.equal(result.hintTrigger, 'slider_still_default');

  const blocks = [
    { id: 'a', block_type: 'text', content: {} },
    { id: 'b', block_type: 'desmos_interactive', content },
  ];
  assert.equal(isLessonCompletionLocked(blocks, ['a']), true);
});

test('existing equivalent flow still works with attempt-aware feedback fallback', () => {
  const content = {
    ...structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT),
    feedback: {
      ...structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT.feedback),
      targeted_hints: [],
      attempt_based_hints: [{ min_attempts: 2, message_html: '<p>Check signs.</p>' }],
    },
  };

  const fail = validateDesmosSubmission({
    content,
    studentExpressions: [{ latex: 'y=x+1', type: 'expression', hidden: false }],
    evaluateAtX: () => NaN,
    attempts: 2,
  });
  assert.equal(fail.feedbackType, 'attempt');

  const pass = validateDesmosSubmission({
    content,
    studentExpressions: [{ latex: 'y=(x+1)(x-3)', type: 'expression', hidden: false }],
    evaluateAtX: (expr, x) => {
      const rhs = String(expr).split('=').pop().trim();
      if (rhs === '(x+1)(x-3)') return (x + 1) * (x - 3);
      return NaN;
    },
    attempts: 3,
  });
  assert.equal(pass.success, true);
  assert.equal(pass.feedbackType, 'success');
});

test('equivalent mode accepts exact latex match when evaluator cannot compute values', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT);
  const pass = validateDesmosSubmission({
    content,
    studentExpressions: [{ latex: 'y=(x+1)(x-3)', type: 'expression', hidden: false }],
    evaluateAtX: () => NaN,
    attempts: 1,
  });

  assert.equal(pass.success, true);
  assert.equal(pass.feedbackType, 'success');
});

test('equivalent mode accepts desmos latex wrappers for equivalent exact input', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT);
  const pass = validateDesmosSubmission({
    content,
    studentExpressions: [{ latex: 'y=\\left(x+1\\right)\\left(x-3\\right)', type: 'expression', hidden: false }],
    evaluateAtX: () => NaN,
    attempts: 1,
  });

  assert.equal(pass.success, true);
});
