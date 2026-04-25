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
