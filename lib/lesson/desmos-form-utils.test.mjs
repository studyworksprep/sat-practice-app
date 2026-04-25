import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupDesmosContent,
  createDesmosTemplate,
  parseCommaSeparatedList,
  parseLineSeparatedList,
  parseNumberList,
  parseSliderInitialValuesText,
  sliderInitialValuesToText,
} from './desmos-form-utils.mjs';

test('parseCommaSeparatedList trims and drops empties', () => {
  assert.deepEqual(parseCommaSeparatedList('a, b,, c'), ['a', 'b', 'c']);
});

test('parseNumberList returns finite numeric list', () => {
  assert.deepEqual(parseNumberList('1,2,x,3'), [1, 2, 3]);
});

test('parseLineSeparatedList returns one item per non-empty line', () => {
  assert.deepEqual(parseLineSeparatedList('y=x\n\n y=2x '), ['y=x', 'y=2x']);
});

test('slider initial values parse + stringify roundtrip', () => {
  const parsed = parseSliderInitialValuesText('X: 1\nY: 2');
  assert.deepEqual(parsed, { X: 1, Y: 2 });
  assert.match(sliderInitialValuesToText(parsed), /X: 1/);
});

test('cleanupDesmosContent removes empty optional structures', () => {
  const cleaned = cleanupDesmosContent({
    goal: { type: 'multi_expression', roles: '' },
    validation: {
      mode: 'state',
      expected: [],
      test_values: [],
      state_rules: {
        must_include_variables: [],
        must_not_include_variables: [],
        required_sliders: [],
        slider_initial_values: {},
      },
    },
    feedback: {
      success_message_html: '<p>ok</p>',
      retry_message_html: '<p>retry</p>',
      targeted_hints: [],
      attempt_based_hints: [],
      solution_html: '',
      reveal_solution_after_attempts: null,
    },
    progression: { require_success: true },
  });

  assert.equal(cleaned.type, 'desmos_interactive');
  assert.equal(cleaned.goal.roles, undefined);
  assert.equal(cleaned.validation.expected, undefined);
  assert.equal(cleaned.validation.state_rules, undefined);
  assert.equal(cleaned.feedback.solution_html, undefined);
});

test('createDesmosTemplate returns known shapes', () => {
  assert.equal(createDesmosTemplate('enter').type, 'desmos_interactive');
  assert.equal(createDesmosTemplate('compare').validation.mode, 'compare_expressions');
  assert.equal(createDesmosTemplate('slider_setup').validation.mode, 'state');
  assert.equal(createDesmosTemplate('slider_move').validation.mode, 'state');
});
