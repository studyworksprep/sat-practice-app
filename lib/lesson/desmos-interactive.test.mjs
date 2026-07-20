import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESMOS_INTERACTIVE_EXAMPLE_CONTENT,
  DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE,
  DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE,
  isLessonCompletionLocked,
  latexToInfix,
  normalizeLessonCalculatorPresentation,
  normalizeExpression,
  parseDesmosInteractiveContent,
  validateDesmosSubmission,
  validateLessonCalculatorPresentation,
} from './desmos-interactive.mjs';

function enterExpressionContent(expected) {
  return {
    id: 'd', type: 'desmos_interactive', instructions_html: '<p>x</p>', initial_expressions: [],
    goal: { type: 'enter_expression', required_count: 1 },
    validation: { mode: 'equivalent', expected: [expected], test_values: [-2, 0, 1, 3], tolerance: 1e-6, state_rules: { min_expressions: 1, max_expressions: 1, require_visible_only: true } },
    feedback: { success_message_html: '<p>ok</p>', retry_message_html: '<p>no</p>' },
    progression: { require_success: true },
  };
}

// Submitted with no graph evaluator, so the arithmetic fallback runs —
// exactly what happens at runtime when Desmos's async numericValue read
// returns NaN. This is the path that decides typed answers.
function submitTyped(expected, typedLatex) {
  return validateDesmosSubmission({
    content: enterExpressionContent(expected),
    studentExpressions: [{ latex: typedLatex, type: 'expression', hidden: false }],
    evaluateAtX: undefined,
    attempts: 1,
  });
}

test('ordinary blocks default to an open lesson scratch calculator', () => {
  const result = normalizeLessonCalculatorPresentation({
    id: 'intro',
    block_type: 'text',
    content: { html: '<p>Hi</p>' },
  });
  assert.equal(result.display, 'open');
  assert.equal(result.mode, 'scratch');
  assert.equal(result.scope, 'scratch');
});

test('interactive calculator state is isolated by block or inherited workflow', () => {
  const baseContent = {
    ...structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT),
    workflow_id: 'flow',
  };
  const blockScoped = normalizeLessonCalculatorPresentation({
    id: 'step-1', block_type: 'desmos_interactive', content: baseContent,
  });
  const workflowScoped = normalizeLessonCalculatorPresentation({
    id: 'step-2',
    block_type: 'desmos_interactive',
    content: { ...baseContent, inherit_from_previous_workflow_desmos: true },
  });
  assert.equal(blockScoped.scope, 'block:step-1');
  assert.equal(workflowScoped.scope, 'workflow:flow');
  assert.equal(workflowScoped.required, true);
});

test('calculator presentation rejects malformed preset metadata', () => {
  assert.deepEqual(validateLessonCalculatorPresentation({ display: 'sideways' }), [
    'calculator.display must be hidden, available, or open',
  ]);
  assert.deepEqual(validateLessonCalculatorPresentation({
    display: 'open', mode: 'preset', initial_state: { expressions: {} }, editable: false,
  }), []);
});

test('preset seed version changes when the authored graph changes', () => {
  const first = normalizeLessonCalculatorPresentation({
    id: 'graph', block_type: 'text', content: {
      calculator: { mode: 'preset', initial_expressions: [{ latex: 'y=x' }] },
    },
  });
  const second = normalizeLessonCalculatorPresentation({
    id: 'graph', block_type: 'text', content: {
      calculator: { mode: 'preset', initial_expressions: [{ latex: 'y=x^2' }] },
    },
  });
  assert.notEqual(first.seed_version, second.seed_version);
});

test('latexToInfix converts typed \\frac and braced exponents to plain arithmetic', () => {
  assert.equal(latexToInfix('\\frac{x}{2}'), '((x)/(2))');
  assert.equal(latexToInfix('x^{2}'), 'x^(2)');
  assert.equal(normalizeExpression('y=\\left(x+1\\right)\\cdot 2'), 'y=(x+1)*2');
});

test('typed fraction (\\frac) is accepted as equivalent to a pasted x/2', () => {
  // Typing "/" in Desmos yields \frac{x}{2}; pasting yields x/2. Both must pass.
  assert.equal(submitTyped('y=x/2', 'y=\\frac{x}{2}').success, true);
  assert.equal(submitTyped('y=x/2', 'y=x/2').success, true);
});

test('typed exponents and algebraically-equivalent forms are accepted', () => {
  assert.equal(submitTyped('y=x^2+2x+1', 'y=\\left(x+1\\right)^{2}').success, true);
  assert.equal(submitTyped('y=(x+1)(x-3)', 'y=x^{2}-2x-3').success, true);
  assert.equal(submitTyped('y=\\frac{x+1}{2}', 'y=\\frac{x}{2}+\\frac{1}{2}').success, true);
});

test('a genuinely wrong typed answer is still rejected', () => {
  assert.equal(submitTyped('y=2x+1', 'y=2x+2').success, false);
});

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

test('multi-expression compare succeeds with fallback evaluator when graph evaluator is unavailable', () => {
  const content = structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);
  const result = validateDesmosSubmission({
    content,
    studentExpressions: [
      { latex: 'y=\\left(x+1\\right)\\left(x-3\\right)', type: 'expression', hidden: false },
      { latex: 'y=x^2-2x-3', type: 'expression', hidden: false },
    ],
    evaluateAtX: () => NaN,
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
