import { createCompareBlock, createDesmosBlock, createSliderBlock, createWorkflowStep } from './block-factories.mjs';

export function buildGraphComparisonWorkflowTemplate({ workflowId = 'graph_compare_1' } = {}) {
  const step1 = createWorkflowStep({
    workflowId,
    stepIndex: 1,
    totalSteps: 4,
    block: createDesmosBlock({
      id: `${workflowId}_step1`,
      title: 'Step 1: Enter the original expression',
      instructions: '<p>Type <strong>y=(x+1)(x-3)</strong>.</p>',
    }),
  });

  const step2 = createWorkflowStep({
    workflowId,
    stepIndex: 2,
    totalSteps: 4,
    block: createCompareBlock({
      id: `${workflowId}_step2`,
      instructions: '<p>Enter exactly two expressions: the original and one candidate.</p>',
    }),
  });

  const step3 = createWorkflowStep({
    workflowId,
    stepIndex: 3,
    totalSteps: 4,
    block: createDesmosBlock({
      id: `${workflowId}_step3`,
      title: 'Step 3: Decide if they match',
      instructions: '<p>Confirm whether your candidate graph matches the original on the shown interval.</p>',
      goal: { type: 'enter_expression', required_count: 1 },
      validation: { mode: 'state', state_rules: { min_expressions: 2, max_expressions: 2, require_visible_only: true } },
      feedback: {
        success_message_html: '<p>Great — both graphs are in place.</p>',
        retry_message_html: '<p>Add both expressions before continuing.</p>',
      },
      progression: { require_success: true },
    }),
  });

  const step4 = {
    id: `${workflowId}_step4`,
    block_type: 'check',
    content: {
      prompt: 'Are the two expressions equivalent?',
      choices: ['Yes', 'No'],
      correct_index: 0,
      explanation: 'They represent the same quadratic.',
      workflow_id: workflowId,
      step_index: 4,
      total_steps: 4,
    },
  };

  return [step1, step2, step3, step4];
}

export function buildSliderWorkflowTemplate({ workflowId = 'slider_workflow_1' } = {}) {
  const step1 = createWorkflowStep({
    workflowId,
    stepIndex: 1,
    totalSteps: 3,
    block: createSliderBlock({ id: `${workflowId}_step1`, mode: 'setup' }),
  });

  const step2 = createWorkflowStep({
    workflowId,
    stepIndex: 2,
    totalSteps: 3,
    block: createSliderBlock({ id: `${workflowId}_step2`, mode: 'move' }),
  });

  const step3 = createWorkflowStep({
    workflowId,
    stepIndex: 3,
    totalSteps: 3,
    block: createDesmosBlock({
      id: `${workflowId}_step3`,
      title: 'Step 3: Observe',
      instructions: '<p>Observe the graph and describe what changes as sliders move.</p>',
      goal: { type: 'enter_expression', required_count: 1 },
      validation: { mode: 'state', state_rules: { min_expressions: 1, require_visible_only: true } },
      feedback: {
        success_message_html: '<p>Nice observation.</p>',
        retry_message_html: '<p>Add your observation expression to continue.</p>',
      },
      progression: { require_success: false },
    }),
  });

  return [step1, step2, step3];
}

export function buildBranchingQuestionTemplate({ baseId = 'branch_q_1' } = {}) {
  return [
    {
      id: `${baseId}_question`,
      block_type: 'check',
      content: {
        prompt: 'Which form is equivalent to y=(x+1)(x-3)?',
        choices: ['y=x^2-2x-3', 'y=x^2+2x-3'],
        correct_index: 0,
        explanation: 'Expand the factors.',
        on_correct_block_id: `${baseId}_correct`,
        on_incorrect_block_id: `${baseId}_incorrect`,
        rejoin_at_block_id: `${baseId}_rejoin`,
      },
    },
    {
      id: `${baseId}_correct`,
      block_type: 'text',
      content: { html: '<p><strong>Correct.</strong> Great factoring.</p>' },
    },
    {
      id: `${baseId}_incorrect`,
      block_type: 'text',
      content: { html: '<p>Not yet. Re-check the middle term sign.</p>' },
    },
    {
      id: `${baseId}_rejoin`,
      block_type: 'text',
      content: { html: '<p>Now continue to the next concept.</p>' },
    },
  ];
}
