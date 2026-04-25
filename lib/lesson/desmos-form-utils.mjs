import {
  DESMOS_INTERACTIVE_EXAMPLE_CONTENT,
  DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE,
  DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE,
  DESMOS_INTERACTIVE_SLIDER_SETUP_EXAMPLE,
} from './desmos-interactive.mjs';

export function parseCommaSeparatedList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseNumberList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((num) => Number.isFinite(num));
}

export function parseLineSeparatedList(value) {
  return String(value || '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseSliderInitialValuesText(value) {
  const result = {};
  const lines = String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const [key, raw] = line.split(':').map((part) => part.trim());
    const num = Number(raw);
    if (!key || !Number.isFinite(num)) continue;
    result[key] = num;
  }
  return result;
}

export function sliderInitialValuesToText(values) {
  return Object.entries(values || {})
    .map(([key, val]) => `${key}: ${val}`)
    .join('\n');
}

export function cleanupDesmosContent(content) {
  const next = structuredClone(content || {});
  next.type = 'desmos_interactive';

  const roles = parseCommaSeparatedList(next.goal?.roles?.join ? next.goal.roles.join(',') : next.goal?.roles || '');
  if (!next.goal) next.goal = {};
  if (roles.length > 0) next.goal.roles = roles;
  else delete next.goal.roles;

  if (next.validation) {
    if (Array.isArray(next.validation.expected) && next.validation.expected.length === 0) delete next.validation.expected;
    if (Array.isArray(next.validation.test_values) && next.validation.test_values.length === 0) delete next.validation.test_values;

    if (next.validation.state_rules) {
      for (const key of [
        'must_include_variables',
        'must_not_include_variables',
        'required_sliders',
      ]) {
        if (Array.isArray(next.validation.state_rules[key]) && next.validation.state_rules[key].length === 0) {
          delete next.validation.state_rules[key];
        }
      }
      if (next.validation.state_rules.slider_initial_values && Object.keys(next.validation.state_rules.slider_initial_values).length === 0) {
        delete next.validation.state_rules.slider_initial_values;
      }
      if (Object.keys(next.validation.state_rules).length === 0) delete next.validation.state_rules;
    }
  }

  if (next.feedback) {
    if (Array.isArray(next.feedback.targeted_hints) && next.feedback.targeted_hints.length === 0) delete next.feedback.targeted_hints;
    if (Array.isArray(next.feedback.attempt_based_hints) && next.feedback.attempt_based_hints.length === 0) delete next.feedback.attempt_based_hints;
    if (!next.feedback.solution_html) delete next.feedback.solution_html;
    if (!Number.isInteger(next.feedback.reveal_solution_after_attempts)) delete next.feedback.reveal_solution_after_attempts;
  }

  if (!next.workflow_id && !next.step_index && !next.step_label && !next.total_steps) {
    delete next.workflow_id;
    delete next.step_index;
    delete next.step_label;
    delete next.total_steps;
  }

  if (!next.inherit_from_previous_workflow_desmos) {
    delete next.inherit_from_previous_workflow_desmos;
  }

  return next;
}

export function createDesmosTemplate(kind) {
  if (kind === 'compare') return structuredClone(DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE);
  if (kind === 'slider_setup') return structuredClone(DESMOS_INTERACTIVE_SLIDER_SETUP_EXAMPLE);
  if (kind === 'slider_move') return structuredClone(DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE);
  return structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT);
}
