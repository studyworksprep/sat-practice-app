import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLessonBlocks } from './lesson-validation.mjs';
import { createCompareBlock, createDesmosBlock, createWorkflowStep } from './block-factories.mjs';
import { buildBranchingQuestionTemplate, buildGraphComparisonWorkflowTemplate } from './lesson-templates.mjs';

test('validateLessonBlocks returns errors for invalid branch targets and schema', () => {
  const blocks = [
    {
      id: 'bad_desmos',
      block_type: 'desmos_interactive',
      content: { title: 'missing required fields' },
    },
    {
      id: 'branch_1',
      block_type: 'check',
      content: {
        prompt: 'Q',
        choices: ['a', 'b'],
        correct_index: 0,
        on_correct_block_id: 'missing_target',
      },
    },
  ];

  const report = validateLessonBlocks(blocks);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.code === 'desmos_schema_invalid'));
  assert.ok(report.errors.some((e) => e.code === 'branch_on_correct_missing_target'));
});

test('workflow validation catches duplicate step indexes and missing total_steps', () => {
  const first = createWorkflowStep({
    workflowId: 'wf_1',
    stepIndex: 1,
    totalSteps: 3,
    block: createDesmosBlock({ id: 'wf1_a' }),
  });
  const second = createWorkflowStep({
    workflowId: 'wf_1',
    stepIndex: 1,
    block: createDesmosBlock({ id: 'wf1_b' }),
  });

  const report = validateLessonBlocks([first, second]);
  assert.ok(report.errors.some((e) => e.code === 'workflow_step_index_duplicate'));
  assert.ok(report.warnings.some((w) => w.code === 'workflow_total_steps_missing'));
});

test('factory compare block produces valid compare_expressions schema', () => {
  const block = createCompareBlock({ id: 'cmp_1' });
  assert.equal(block.block_type, 'desmos_interactive');
  assert.equal(block.content.validation.mode, 'compare_expressions');
  assert.equal(block.content.goal.required_count, 2);

  const report = validateLessonBlocks([block]);
  assert.equal(report.ok, true);
});

test('bare graph expressions do not produce an explicit-equation warning', () => {
  const block = createDesmosBlock({ id: 'bare_graph' });
  block.content.validation.expected = ['x^2-5x+6'];
  const report = validateLessonBlocks([block]);
  assert.equal(report.warnings.some((warning) => warning.code === 'expected_missing_equals'), false);
});

test('templates produce connected branching ids', () => {
  const blocks = buildBranchingQuestionTemplate({ baseId: 'bq1' });
  const report = validateLessonBlocks(blocks);
  assert.equal(report.ok, true);
});

test('graph template includes workflow visualization entries', () => {
  const blocks = buildGraphComparisonWorkflowTemplate({ workflowId: 'wf_graph' });
  const report = validateLessonBlocks(blocks);
  assert.ok(report.workflowVisualization.some((line) => line.includes('wf_graph')));
});

test('lesson_complete as the last block is valid with no dead-end warning', () => {
  const report = validateLessonBlocks([
    { id: 'intro', block_type: 'text', content: { id: 'intro', html: '<p>hi</p>' } },
    { id: 'done', block_type: 'lesson_complete', content: { id: 'done', html: '<p>bye</p>', button_label: 'Complete Lesson' } },
  ]);
  assert.equal(report.ok, true);
  assert.equal(report.warnings.some((w) => w.code === 'dead_end_block'), false);
});

test('lesson_complete not-last or duplicated is an error', () => {
  const notLast = validateLessonBlocks([
    { id: 'done', block_type: 'lesson_complete', content: { id: 'done', html: '<p>bye</p>' } },
    { id: 'more', block_type: 'text', content: { id: 'more', html: '<p>more</p>' } },
  ]);
  assert.equal(notLast.ok, false);
  assert.ok(notLast.errors.some((e) => e.code === 'completion_block_not_last'));

  const two = validateLessonBlocks([
    { id: 'a', block_type: 'text', content: { id: 'a', html: '<p>1</p>' } },
    { id: 'b', block_type: 'lesson_complete', content: { id: 'b', html: '<p>2</p>' } },
    { id: 'c', block_type: 'lesson_complete', content: { id: 'c', html: '<p>3</p>' } },
  ]);
  assert.equal(two.ok, false);
  assert.ok(two.errors.some((e) => e.code === 'multiple_completion_blocks'));
});

test('calculator presentation validates shape and warns on empty presets', () => {
  const invalid = validateLessonBlocks([
    { id: 'bad', block_type: 'text', content: { html: '<p>x</p>', calculator: { display: 'sideways' } } },
    { id: 'done', block_type: 'lesson_complete', content: { html: '<p>done</p>' } },
  ]);
  assert.ok(invalid.errors.some((e) => e.code === 'calculator_presentation_invalid'));

  const emptyPreset = validateLessonBlocks([
    { id: 'preset', block_type: 'text', content: { html: '<p>x</p>', calculator: { display: 'open', mode: 'preset' } } },
    { id: 'done', block_type: 'lesson_complete', content: { html: '<p>done</p>' } },
  ]);
  assert.ok(emptyPreset.warnings.some((e) => e.code === 'calculator_preset_empty'));
});

test('figure validates shape on any block', () => {
  const invalid = validateLessonBlocks([
    { id: 'f1', block_type: 'text', content: { html: '<p>x</p>', figure: { src: '/images/tri.svg' } } },
    { id: 'f2', block_type: 'check', content: { prompt: 'p', choices: ['a', 'b'], correct_index: 0, figure: 'tri.svg' } },
    { id: 'done', block_type: 'lesson_complete', content: { html: '<p>done</p>' } },
  ]);
  const figureErrors = invalid.errors.filter((e) => e.code === 'figure_invalid');
  assert.equal(figureErrors.length, 2);
  assert.deepEqual(figureErrors.map((e) => e.blockId), ['f1', 'f2']);

  const valid = validateLessonBlocks([
    {
      id: 'f1',
      block_type: 'text',
      content: {
        html: '<p>x</p>',
        figure: { src: '/images/tri.svg', alt: 'Two triangles', caption: 'Figure 1' },
      },
    },
    { id: 'done', block_type: 'lesson_complete', content: { html: '<p>done</p>' } },
  ]);
  assert.equal(valid.errors.filter((e) => e.code === 'figure_invalid').length, 0);
});

test('check solution and reveal-threshold fields validate shape', () => {
  const good = validateLessonBlocks([
    {
      id: 'c1',
      block_type: 'check',
      content: {
        id: 'c1', prompt: 'p', choices: ['a', 'b'], correct_index: 0,
        allow_retry: true, hint: 'h', solution: 'Step 1.\nStep 2.',
        max_attempts_before_reveal: 3,
      },
    },
    { id: 'done', block_type: 'lesson_complete', content: { html: '<p>done</p>' } },
  ]);
  assert.equal(good.ok, true);
  assert.equal(good.warnings.some((w) => w.code === 'check_solution_without_retry'), false);

  const bad = validateLessonBlocks([
    {
      id: 'c1',
      block_type: 'check',
      content: {
        id: 'c1', prompt: 'p', choices: ['a', 'b'], correct_index: 0,
        allow_retry: true, solution: '   ', max_attempts_before_reveal: 0,
      },
    },
    { id: 'done', block_type: 'lesson_complete', content: { html: '<p>done</p>' } },
  ]);
  assert.ok(bad.errors.some((e) => e.code === 'check_solution_invalid'));
  assert.ok(bad.errors.some((e) => e.code === 'check_max_attempts_invalid'));
});

test('a solution on a one-shot check warns as dead content', () => {
  const report = validateLessonBlocks([
    {
      id: 'c1',
      block_type: 'check',
      content: {
        id: 'c1', prompt: 'p', choices: ['a', 'b'], correct_index: 0,
        allow_retry: false, solution: 'Never shown.',
      },
    },
    { id: 'done', block_type: 'lesson_complete', content: { html: '<p>done</p>' } },
  ]);
  assert.equal(report.ok, true);
  assert.ok(report.warnings.some((w) => w.code === 'check_solution_without_retry'));
});

// ─── check shape (plan 1.6) ─────────────────────────────────────

test('a multiple-choice check needs 2+ choices and an in-range correct_index', () => {
  const one = validateLessonBlocks([
    { id: 'c', block_type: 'check', content: { prompt: 'Q', choices: ['only'], correct_index: 0 } },
  ]);
  assert.ok(one.errors.some((e) => e.code === 'check_choices_invalid'));

  const range = validateLessonBlocks([
    { id: 'c', block_type: 'check', content: { prompt: 'Q', choices: ['a', 'b'], correct_index: 2 } },
  ]);
  assert.ok(range.errors.some((e) => e.code === 'check_correct_index_invalid'));

  // A missing index is lenient (the runtime treats it as 0) but flagged.
  const missing = validateLessonBlocks([
    { id: 'c', block_type: 'check', content: { prompt: 'Q', choices: ['a', 'b'] } },
  ]);
  assert.equal(missing.errors.length, 0);
  assert.ok(missing.warnings.some((w) => w.code === 'check_correct_index_missing'));
});

test('a numeric-entry check validates its answer fields and rejects choices', () => {
  const good = validateLessonBlocks([
    { id: 'n', block_type: 'check', content: { prompt: 'Q', input: 'numeric', answer: '25/2', accept: ['12.5'] } },
  ]);
  assert.equal(good.errors.length, 0);
  assert.ok(!good.warnings.some((w) => w.code.startsWith('check_')));

  const bad = validateLessonBlocks([
    { id: 'n', block_type: 'check', content: { prompt: 'Q', input: 'numeric', answer: 'x', choices: ['a', 'b'], correct_index: 0 } },
  ]);
  const messages = bad.errors.filter((e) => e.code === 'check_numeric_invalid').map((e) => e.message);
  assert.equal(messages.length, 2);
  assert.ok(messages.some((m) => /not a number/.test(m)));
  assert.ok(messages.some((m) => /carries no choices/.test(m)));
});
