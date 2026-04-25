import {
  DESMOS_INTERACTIVE_EXAMPLE_CONTENT,
  DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE,
  DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE,
  DESMOS_INTERACTIVE_SLIDER_SETUP_EXAMPLE,
  parseDesmosInteractiveContent,
} from './desmos-interactive.mjs';

function makeId(prefix = 'block') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createWorkflowStep({ block, workflowId, stepIndex, totalSteps, inheritFromPreviousWorkflowDesmos = false }) {
  return {
    ...block,
    content: {
      ...(block.content || {}),
      workflow_id: workflowId,
      step_index: stepIndex,
      total_steps: totalSteps,
      inherit_from_previous_workflow_desmos: Boolean(inheritFromPreviousWorkflowDesmos),
    },
  };
}

export function createDesmosBlock({
  id = makeId('desmos'),
  title,
  instructions,
  instructions_html,
  caption = '',
  caption_html,
  initialExpressions,
  initial_expressions,
  calculatorOptions,
  calculator_options,
  goal,
  validation,
  feedback,
  progression,
  workflow,
  branching,
} = {}) {
  const base = structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT);

  const content = {
    title: title ?? base.title,
    instructions_html: instructions ?? instructions_html ?? base.instructions_html,
    caption_html: caption_html ?? caption,
    initial_expressions: initialExpressions ?? initial_expressions ?? base.initial_expressions,
    calculator_options: calculatorOptions ?? calculator_options ?? base.calculator_options,
    goal: goal ?? base.goal,
    validation: validation ?? base.validation,
    feedback: feedback ?? base.feedback,
    progression: progression ?? base.progression,
  };

  const block = {
    id,
    block_type: 'desmos_interactive',
    content,
  };

  if (workflow) {
    block.content.workflow_id = workflow.workflow_id;
    block.content.step_index = workflow.step_index;
    block.content.total_steps = workflow.total_steps;
    if (workflow.inherit_from_previous_workflow_desmos != null) {
      block.content.inherit_from_previous_workflow_desmos = workflow.inherit_from_previous_workflow_desmos;
    }
  }

  if (branching) {
    if (branching.on_correct_block_id) block.content.on_correct_block_id = branching.on_correct_block_id;
    if (branching.on_incorrect_block_id) block.content.on_incorrect_block_id = branching.on_incorrect_block_id;
    if (branching.rejoin_at_block_id) block.content.rejoin_at_block_id = branching.rejoin_at_block_id;
  }

  parseDesmosInteractiveContent(block.content);
  return block;
}

export function createCompareBlock({
  id = makeId('compare'),
  instructions,
  firstExpression = 'y=(x+1)(x-3)',
  secondExpression = 'y=x^2-2x-3',
  workflow,
  feedback,
} = {}) {
  const compare = structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);
  compare.instructions_html = instructions ?? compare.instructions_html;
  compare.validation.state_rules = {
    ...(compare.validation.state_rules || {}),
    min_expressions: 2,
    max_expressions: 2,
    require_visible_only: true,
  };
  compare.goal = { ...(compare.goal || {}), type: 'multi_expression', required_count: 2 };
  if (feedback) compare.feedback = { ...compare.feedback, ...feedback };

  const block = createDesmosBlock({
    id,
    title: compare.title,
    instructions_html: compare.instructions_html,
    caption_html: compare.caption_html,
    initial_expressions: compare.initial_expressions,
    calculator_options: compare.calculator_options,
    goal: compare.goal,
    validation: compare.validation,
    feedback: compare.feedback,
    progression: compare.progression,
    workflow,
  });

  // Give authors immediate example in prompt/caption.
  block.content.caption_html = `<p>Try <strong>${firstExpression}</strong> and <strong>${secondExpression}</strong>.</p>`;
  return block;
}

export function createSliderBlock({
  id = makeId('slider'),
  mode = 'setup',
  instructions,
  workflow,
  feedback,
} = {}) {
  const source = mode === 'move'
    ? structuredClone(DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE)
    : structuredClone(DESMOS_INTERACTIVE_SLIDER_SETUP_EXAMPLE);

  if (instructions) source.instructions_html = instructions;
  if (feedback) source.feedback = { ...source.feedback, ...feedback };

  return createDesmosBlock({
    id,
    title: source.title,
    instructions_html: source.instructions_html,
    caption_html: source.caption_html,
    initial_expressions: source.initial_expressions,
    calculator_options: source.calculator_options,
    goal: source.goal,
    validation: source.validation,
    feedback: source.feedback,
    progression: source.progression,
    workflow,
  });
}
