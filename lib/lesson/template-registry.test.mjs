import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBranchingQuestionTemplate,
  createGraphComparisonWorkflow,
  createIdGenerator,
  createSliderWorkflow,
  insertTemplateBlocks,
  lessonTemplates,
  replacePlaceholders,
} from './template-registry.mjs';

test('replacePlaceholders swaps template variables', () => {
  const result = replacePlaceholders('Enter {{expr}}', { expr: 'y=x' });
  assert.equal(result, 'Enter y=x');
});

test('id generator avoids collisions', () => {
  const generate = createIdGenerator(['graph_step_1']);
  assert.equal(generate('graph_step_1'), 'graph_step_1_2');
  assert.equal(generate('graph_step_1'), 'graph_step_1_3');
});

test('graph comparison workflow returns expected block count and branching wiring', () => {
  const blocks = createGraphComparisonWorkflow({ workflowId: 'wf_test' });
  assert.equal(blocks.length, 7);
  assert.equal(blocks[0].content.workflow_id, 'wf_test');
  assert.equal(blocks[0].content.step_index, 1);
  assert.equal(blocks[3].content.on_correct_block_id, blocks[4].id);
  assert.equal(blocks[3].content.on_incorrect_block_id, blocks[5].id);
  assert.equal(blocks[3].content.rejoin_at_block_id, blocks[6].id);
});

test('slider workflow returns four steps with consistent metadata', () => {
  const blocks = createSliderWorkflow({ workflowId: 'slider_wf' });
  assert.equal(blocks.length, 4);
  assert.equal(blocks[2].content.step_index, 3);
  assert.equal(blocks[2].content.total_steps, 4);
});

test('branching question template creates four linked blocks', () => {
  const blocks = createBranchingQuestionTemplate({ baseId: 'bq' });
  assert.equal(blocks.length, 4);
  assert.equal(blocks[0].content.on_correct_block_id, blocks[1].id);
});

test('insert template blocks preserves surrounding blocks and recomputes sort order', () => {
  const existing = [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }];
  const inserted = insertTemplateBlocks(existing, 0, [{ id: 'x' }, { id: 'y' }]);
  assert.deepEqual(inserted.map((b) => b.id), ['a', 'x', 'y', 'b']);
  assert.deepEqual(inserted.map((b) => b.sort_order), [0, 1, 2, 3]);
});

test('template registry exposes required templates', () => {
  assert.ok(lessonTemplates.graph_comparison_workflow);
  assert.ok(lessonTemplates.slider_workflow);
  assert.ok(lessonTemplates.branching_question);
});
