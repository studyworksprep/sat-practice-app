import { createDesmosTemplate } from './desmos-form-utils.mjs';
import { recomputeSortOrders } from './editor-utils.mjs';

export function replacePlaceholders(template, params = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(params[key] ?? ''));
}

export function createIdGenerator(existingIds = []) {
  const used = new Set((existingIds || []).map(String));
  return function generateBlockId(prefix) {
    let candidate = String(prefix);
    let count = 1;
    while (used.has(candidate)) {
      count += 1;
      candidate = `${prefix}_${count}`;
    }
    used.add(candidate);
    return candidate;
  };
}

function withWorkflow(content, workflowId, stepIndex, totalSteps, stepLabel) {
  return {
    ...content,
    workflow_id: workflowId,
    step_index: stepIndex,
    total_steps: totalSteps,
    step_label: stepLabel,
  };
}

export function createGraphComparisonWorkflow(params = {}, options = {}) {
  const {
    workflowId = 'graph_compare_1',
    originalExpression = 'y=(x+1)(x-3)',
    candidateExpression = 'y=x^2-2x-3',
  } = params;

  const genId = createIdGenerator(options.existingIds || []);
  const ids = {
    step1: genId(`${workflowId}_step_1`),
    step2: genId(`${workflowId}_step_2`),
    step3: genId(`${workflowId}_step_3`),
    decision: genId(`${workflowId}_decision`),
    correct: genId(`${workflowId}_correct`),
    incorrect: genId(`${workflowId}_incorrect`),
    rejoin: genId(`${workflowId}_rejoin`),
  };

  const step1 = createDesmosTemplate('enter');
  step1.id = ids.step1;
  step1.title = 'Step 1: Enter original expression';
  step1.instructions_html = replacePlaceholders('<p>Enter <strong>{{original_expression}}</strong>.</p>', { original_expression: originalExpression });
  step1.validation.expected = [originalExpression];
  step1.feedback.solution_html = `<p>Correct input: <strong>${originalExpression}</strong></p>`;

  const step2 = createDesmosTemplate('enter');
  step2.id = ids.step2;
  step2.title = 'Step 2: Add candidate expression';
  step2.instructions_html = replacePlaceholders('<p>Add candidate <strong>{{candidate_expression}}</strong> while keeping the original.</p>', { candidate_expression: candidateExpression });
  step2.validation.mode = 'state';
  step2.validation.state_rules = { min_expressions: 2, max_expressions: 2, require_visible_only: true };
  step2.goal = { type: 'multi_expression', required_count: 2, roles: ['original', 'candidate'] };
  step2.inherit_from_previous_workflow_desmos = true;

  const step3 = createDesmosTemplate('compare');
  step3.id = ids.step3;
  step3.title = 'Step 3: Compare expressions';
  step3.instructions_html = replacePlaceholders('<p>Compare <strong>{{original_expression}}</strong> and <strong>{{candidate_expression}}</strong>.</p>', {
    original_expression: originalExpression,
    candidate_expression: candidateExpression,
  });
  step3.feedback.solution_html = `<p>Equivalent pair: <strong>${originalExpression}</strong> and <strong>${candidateExpression}</strong>.</p>`;
  step3.inherit_from_previous_workflow_desmos = true;

  return [
    { id: ids.step1, block_type: 'desmos_interactive', content: withWorkflow(step1, workflowId, 1, 4, 'Enter original') },
    { id: ids.step2, block_type: 'desmos_interactive', content: withWorkflow(step2, workflowId, 2, 4, 'Add candidate') },
    { id: ids.step3, block_type: 'desmos_interactive', content: withWorkflow(step3, workflowId, 3, 4, 'Compare') },
    {
      id: ids.decision,
      block_type: 'check',
      content: {
        ...withWorkflow({}, workflowId, 4, 4, 'Decision'),
        prompt: 'Are these expressions equivalent?',
        choices: ['Yes', 'No'],
        correct_index: 0,
        explanation: 'Equivalent forms produce identical graphs.',
        on_correct_block_id: ids.correct,
        on_incorrect_block_id: ids.incorrect,
        rejoin_at_block_id: ids.rejoin,
      },
    },
    { id: ids.correct, block_type: 'text', content: { id: ids.correct, html: '<p><strong>Correct.</strong> Nice comparison.</p>' } },
    { id: ids.incorrect, block_type: 'text', content: { id: ids.incorrect, html: '<p>Not quite. Re-check signs and expansion.</p>' } },
    { id: ids.rejoin, block_type: 'text', content: { id: ids.rejoin, html: '<p>Great, continue to the next concept.</p>' } },
  ];
}

export function createSliderWorkflow(params = {}, options = {}) {
  const { workflowId = 'slider_workflow_1' } = params;
  const genId = createIdGenerator(options.existingIds || []);
  const ids = [1, 2, 3, 4].map((n) => genId(`${workflowId}_step_${n}`));

  const step1 = createDesmosTemplate('slider_setup');
  step1.id = ids[0];
  step1.title = 'Step 1: Enter expression with X/Y';

  const step2 = createDesmosTemplate('slider_setup');
  step2.id = ids[1];
  step2.title = 'Step 2: Create sliders';
  step2.inherit_from_previous_workflow_desmos = true;

  const step3 = createDesmosTemplate('slider_move');
  step3.id = ids[2];
  step3.title = 'Step 3: Move sliders';
  step3.inherit_from_previous_workflow_desmos = true;

  return [
    { id: ids[0], block_type: 'desmos_interactive', content: withWorkflow(step1, workflowId, 1, 4, 'Enter expression') },
    { id: ids[1], block_type: 'desmos_interactive', content: withWorkflow(step2, workflowId, 2, 4, 'Create sliders') },
    { id: ids[2], block_type: 'desmos_interactive', content: withWorkflow(step3, workflowId, 3, 4, 'Move sliders') },
    {
      id: ids[3],
      block_type: 'check',
      content: {
        ...withWorkflow({}, workflowId, 4, 4, 'Observation'),
        prompt: 'What changes when slider values move?',
        choices: ['Graph shape/position changes', 'Nothing changes'],
        correct_index: 0,
        explanation: 'Sliders modify coefficients and graph behavior.',
      },
    },
  ];
}

export function createBranchingQuestionTemplate(params = {}, options = {}) {
  const {
    baseId = 'branching_q_1',
    prompt = 'Which expression is equivalent?',
    choices = ['Choice A', 'Choice B'],
    correctIndex = 0,
  } = params;

  const genId = createIdGenerator(options.existingIds || []);
  const questionId = genId(`${baseId}_question`);
  const correctId = genId(`${baseId}_correct`);
  const incorrectId = genId(`${baseId}_incorrect`);
  const rejoinId = genId(`${baseId}_rejoin`);

  return [
    {
      id: questionId,
      block_type: 'check',
      content: {
        prompt,
        choices,
        correct_index: correctIndex,
        explanation: 'Review equivalent transformations.',
        on_correct_block_id: correctId,
        on_incorrect_block_id: incorrectId,
        rejoin_at_block_id: rejoinId,
      },
    },
    { id: correctId, block_type: 'text', content: { id: correctId, html: '<p><strong>Correct.</strong></p>' } },
    { id: incorrectId, block_type: 'text', content: { id: incorrectId, html: '<p>Incorrect. Try reviewing the previous step.</p>' } },
    { id: rejoinId, block_type: 'text', content: { id: rejoinId, html: '<p>Rejoin and continue.</p>' } },
  ];
}

export function insertTemplateBlocks(existingBlocks, insertAfterIndex, templateBlocks) {
  const left = existingBlocks.slice(0, insertAfterIndex + 1);
  const right = existingBlocks.slice(insertAfterIndex + 1);
  return recomputeSortOrders([...left, ...templateBlocks, ...right]);
}

export const lessonTemplates = {
  graph_comparison_workflow: {
    label: 'Graph Comparison Workflow',
    create: createGraphComparisonWorkflow,
  },
  slider_workflow: {
    label: 'Slider Workflow',
    create: createSliderWorkflow,
  },
  branching_question: {
    label: 'Branching Question',
    create: createBranchingQuestionTemplate,
  },
};
