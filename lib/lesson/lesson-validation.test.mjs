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
