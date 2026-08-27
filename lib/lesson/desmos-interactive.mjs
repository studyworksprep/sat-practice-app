/**
 * @typedef {Object} DesmosInteractiveBlock
 * @property {string} id
 * @property {'desmos_interactive'} type
 * @property {string=} title
 * @property {string} instructions_html
 * @property {string=} caption_html
 * @property {{ id?: string, latex: string }[]} initial_expressions
 * @property {Object=} initial_state Opaque state captured from GraphingCalculator.getState().
 * @property {{ expressions?: boolean, lockViewport?: boolean, sliders?: boolean }=} calculator_options
 * @property {{ type: 'enter_expression' | 'multi_expression', required_count?: number, roles?: string[] | {name: string, count: number}[] }} goal
 * @property {{ mode: 'normalized' | 'equivalent' | 'state' | 'compare_expressions', comparison?: 'equivalent', expected?: string[], test_values?: number[], tolerance?: number, state_rules?: { min_expressions?: number, max_expressions?: number, require_visible_only?: boolean, must_include_variables?: string[], must_not_include_variables?: string[], allow_text_only_expressions?: boolean, required_sliders?: string[], require_slider_creation?: boolean, require_slider_movement?: boolean, slider_initial_values?: Record<string, number>, forbid_default_slider_values_on_submit?: boolean } }} validation
 * @property {{ success_message_html: string, retry_message_html: string, targeted_hints?: { trigger: 'missing_y_equals'|'uses_forbidden_variables'|'likely_parentheses_error'|'too_many_expressions'|'too_few_expressions'|'missing_required_slider'|'slider_not_moved'|'slider_still_default'|'missing_second_expression'|'expressions_not_comparable', message_html: string }[], attempt_based_hints?: { min_attempts: number, message_html: string }[], reveal_solution_after_attempts?: number, solution_html?: string }} feedback
 * @property {{ require_success: boolean }} progression
 */

const DEFAULT_TOLERANCE = 1e-6;
// Fitted regression constants are read off a numeric solver, so an
// exact match is the wrong test; authors may still tighten or loosen
// this per parameter.
const DEFAULT_PARAMETER_TOLERANCE = 0.01;
const DEFAULT_TABLE_TOLERANCE = 1e-9;
const CALCULATOR_DISPLAYS = new Set(['hidden', 'available', 'open']);
const CALCULATOR_MODES = new Set(['scratch', 'preset']);
const HINT_PRIORITY = [
  'uses_forbidden_variables',
  'missing_required_slider',
  'slider_still_default',
  'slider_not_moved',
  'missing_y_equals',
  'likely_parentheses_error',
  'too_few_expressions',
  'too_many_expressions',
  'missing_second_expression',
  'expressions_not_comparable',
  // Regression-workflow triggers (plan 3.2), structural before numeric:
  // a missing table explains a missing fit, which explains a bad value.
  'missing_table',
  'table_rows_mismatch',
  'missing_regression',
  'missing_parameter',
  'parameter_mismatch',
];

function calculatorSeedFingerprint(value) {
  const input = JSON.stringify(value ?? null);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Convert the LaTeX forms Desmos emits when a learner *types* an
// expression into plain infix arithmetic. The big one: typing "/" in
// Desmos produces \frac{a}{b}, and "^" produces x^{...} — neither of
// which the downstream string match or arithmetic evaluator understood,
// so a typed answer was rejected while a pasted literal ("x/2") matched.
// Handles \left/\right, \cdot/\times, nested \frac, and braced exponents.
export function latexToInfix(input) {
  let s = String(input || '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*');

  // \frac{a}{b} -> ((a)/(b)); iterate so nested fractions collapse.
  for (let i = 0; i < 8; i += 1) {
    const next = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
    if (next === s) break;
    s = next;
  }
  // x^{...} -> x^(...) so multi-term exponents group correctly.
  for (let i = 0; i < 8; i += 1) {
    const next = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)');
    if (next === s) break;
    s = next;
  }
  // Any remaining braces are stray grouping; drop them.
  return s.replace(/[{}]/g, '');
}

export function normalizeExpression(input) {
  return latexToInfix(input)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/**
 * Normalize the optional calculator presentation attached to any lesson
 * block. Interactive blocks always use a controlled, block-scoped
 * calculator; ordinary blocks default to an open lesson scratchpad.
 */
export function normalizeLessonCalculatorPresentation(block) {
  const type = block?.block_type;
  const content = block?.content || {};

  if (type === 'desmos_interactive') {
    const workflowId = content.workflow_id;
    const inheritWorkflow = Boolean(
      workflowId && content.inherit_from_previous_workflow_desmos,
    );
    return {
      display: 'open',
      mode: 'interactive',
      scope: inheritWorkflow ? `workflow:${workflowId}` : `block:${block?.id || content.id || 'interactive'}`,
      title: content.title || 'Required Desmos activity',
      initial_state: content.initial_state || null,
      initial_expressions: Array.isArray(content.initial_expressions)
        ? content.initial_expressions
        : [],
      calculator_options: {
        expressions: content.calculator_options?.expressions ?? true,
        lockViewport: content.calculator_options?.lockViewport ?? false,
        sliders: content.calculator_options?.sliders ?? true,
        keypadActivated: content.calculator_options?.expressions ?? true,
      },
      resettable: true,
      required: true,
      seed_version: calculatorSeedFingerprint({
        initial_state: content.initial_state || null,
        initial_expressions: content.initial_expressions || [],
        validation: content.validation || null,
      }),
    };
  }

  const raw = content.calculator && typeof content.calculator === 'object'
    ? content.calculator
    : {};
  const display = CALCULATOR_DISPLAYS.has(raw.display) ? raw.display : 'open';
  const mode = CALCULATOR_MODES.has(raw.mode) ? raw.mode : 'scratch';
  const blockId = block?.id || content.id || 'block';

  return {
    display,
    mode,
    scope: mode === 'scratch' ? 'scratch' : `block:${blockId}`,
    title: typeof raw.title === 'string' && raw.title.trim()
      ? raw.title.trim()
      : mode === 'preset'
        ? 'Explore the graph'
        : 'Scratch calculator',
    initial_state: raw.initial_state || null,
    initial_expressions: Array.isArray(raw.initial_expressions)
      ? raw.initial_expressions
      : [],
    calculator_options: {
      expressions: raw.editable !== false,
      lockViewport: raw.lock_viewport === true,
      sliders: raw.editable !== false,
      keypadActivated: mode === 'scratch' && raw.editable !== false,
    },
    resettable: raw.resettable !== false,
    required: false,
    seed_version: mode === 'preset'
      ? calculatorSeedFingerprint({
          initial_state: raw.initial_state || null,
          initial_expressions: raw.initial_expressions || [],
        })
      : null,
  };
}

export function validateLessonCalculatorPresentation(calculator) {
  const errors = [];
  if (calculator == null) return errors;
  if (!calculator || typeof calculator !== 'object' || Array.isArray(calculator)) {
    return ['calculator must be an object'];
  }
  if (calculator.display != null && !CALCULATOR_DISPLAYS.has(calculator.display)) {
    errors.push('calculator.display must be hidden, available, or open');
  }
  if (calculator.mode != null && !CALCULATOR_MODES.has(calculator.mode)) {
    errors.push('calculator.mode must be scratch or preset');
  }
  if (calculator.initial_state != null && (
    !calculator.initial_state ||
    typeof calculator.initial_state !== 'object' ||
    Array.isArray(calculator.initial_state)
  )) {
    errors.push('calculator.initial_state must be an object captured from Desmos');
  }
  if (calculator.initial_expressions != null && !Array.isArray(calculator.initial_expressions)) {
    errors.push('calculator.initial_expressions must be an array');
  }
  for (const key of ['editable', 'resettable', 'lock_viewport']) {
    if (calculator[key] != null && typeof calculator[key] !== 'boolean') {
      errors.push(`calculator.${key} must be a boolean`);
    }
  }
  return errors;
}

export function parseDesmosInteractiveContent(content) {
  if (!content || typeof content !== 'object') {
    throw new Error('desmos_interactive content must be an object');
  }

  if (typeof content.instructions_html !== 'string' || !content.instructions_html.trim()) {
    throw new Error('desmos_interactive.instructions_html is required');
  }

  if (!Array.isArray(content.initial_expressions)) {
    throw new Error('desmos_interactive.initial_expressions must be an array');
  }

  if (content.initial_state != null && (
    !content.initial_state ||
    typeof content.initial_state !== 'object' ||
    Array.isArray(content.initial_state)
  )) {
    throw new Error('desmos_interactive.initial_state must be an object captured from Desmos');
  }

  const goal = content.goal;
  if (!goal || !['enter_expression', 'multi_expression'].includes(goal.type)) {
    throw new Error('desmos_interactive.goal.type must be enter_expression or multi_expression');
  }

  if (goal.required_count != null && (!Number.isInteger(goal.required_count) || goal.required_count < 1)) {
    throw new Error('desmos_interactive.goal.required_count must be an integer >= 1');
  }

  if (goal.roles != null && !Array.isArray(goal.roles)) {
    throw new Error('desmos_interactive.goal.roles must be an array when provided');
  }

  const validation = content.validation;
  if (!validation || !['normalized', 'equivalent', 'state', 'compare_expressions'].includes(validation.mode)) {
    throw new Error('desmos_interactive.validation.mode must be normalized, equivalent, state, or compare_expressions');
  }

  if (['normalized', 'equivalent'].includes(validation.mode)) {
    if (!Array.isArray(validation.expected) || validation.expected.length === 0) {
      throw new Error('desmos_interactive.validation.expected must be a non-empty array for normalized/equivalent mode');
    }
  }

  if (validation.mode === 'compare_expressions') {
    if (validation.comparison && validation.comparison !== 'equivalent') {
      throw new Error('desmos_interactive.validation.comparison only supports equivalent in MVP');
    }
  }

  if (validation.mode === 'equivalent' || validation.mode === 'compare_expressions') {
    if (!Array.isArray(validation.test_values) || validation.test_values.length === 0) {
      throw new Error('desmos_interactive.validation.test_values must be provided for equivalent/compare_expressions mode');
    }
    if (validation.tolerance != null && !(typeof validation.tolerance === 'number' && validation.tolerance >= 0)) {
      throw new Error('desmos_interactive.validation.tolerance must be a number >= 0');
    }
  }

  const stateRules = validation.state_rules;
  if (stateRules != null) {
    if (stateRules.min_expressions != null && (!Number.isInteger(stateRules.min_expressions) || stateRules.min_expressions < 0)) {
      throw new Error('desmos_interactive.validation.state_rules.min_expressions must be an integer >= 0');
    }
    if (stateRules.max_expressions != null && (!Number.isInteger(stateRules.max_expressions) || stateRules.max_expressions < 0)) {
      throw new Error('desmos_interactive.validation.state_rules.max_expressions must be an integer >= 0');
    }
    if (stateRules.min_expressions != null && stateRules.max_expressions != null && stateRules.min_expressions > stateRules.max_expressions) {
      throw new Error('desmos_interactive.validation.state_rules.min_expressions cannot exceed max_expressions');
    }
    if (stateRules.must_include_variables != null && !Array.isArray(stateRules.must_include_variables)) {
      throw new Error('desmos_interactive.validation.state_rules.must_include_variables must be an array');
    }
    if (stateRules.must_not_include_variables != null && !Array.isArray(stateRules.must_not_include_variables)) {
      throw new Error('desmos_interactive.validation.state_rules.must_not_include_variables must be an array');
    }
    if (stateRules.required_sliders != null && !Array.isArray(stateRules.required_sliders)) {
      throw new Error('desmos_interactive.validation.state_rules.required_sliders must be an array');
    }
    if (stateRules.slider_initial_values != null) {
      if (!stateRules.slider_initial_values || typeof stateRules.slider_initial_values !== 'object' || Array.isArray(stateRules.slider_initial_values)) {
        throw new Error('desmos_interactive.validation.state_rules.slider_initial_values must be an object');
      }
      for (const [name, value] of Object.entries(stateRules.slider_initial_values)) {
        if (typeof name !== 'string' || typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error('desmos_interactive.validation.state_rules.slider_initial_values must map slider names to finite numbers');
        }
      }
    }
    for (const key of ['require_slider_creation', 'require_slider_movement', 'forbid_default_slider_values_on_submit']) {
      if (stateRules[key] != null && typeof stateRules[key] !== 'boolean') {
        throw new Error(`desmos_interactive.validation.state_rules.${key} must be a boolean`);
      }
    }

    if (stateRules.require_regression != null && typeof stateRules.require_regression !== 'boolean') {
      throw new Error('desmos_interactive.validation.state_rules.require_regression must be a boolean');
    }

    const requireTable = stateRules.require_table;
    if (requireTable != null && typeof requireTable !== 'boolean') {
      if (!requireTable || typeof requireTable !== 'object' || Array.isArray(requireTable)) {
        throw new Error('desmos_interactive.validation.state_rules.require_table must be a boolean or an object');
      }
      if (requireTable.rows != null) {
        if (!Array.isArray(requireTable.rows) || requireTable.rows.length === 0) {
          throw new Error('desmos_interactive.validation.state_rules.require_table.rows must be a non-empty array');
        }
        for (const row of requireTable.rows) {
          if (!Array.isArray(row) || row.length === 0 || row.some((cell) => typeof cell !== 'number' || !Number.isFinite(cell))) {
            throw new Error('desmos_interactive.validation.state_rules.require_table.rows entries must be arrays of finite numbers');
          }
        }
      }
      if (requireTable.columns != null && (
        !Array.isArray(requireTable.columns) ||
        requireTable.columns.some((name) => typeof name !== 'string' || !name.trim())
      )) {
        throw new Error('desmos_interactive.validation.state_rules.require_table.columns must be an array of column names');
      }
      if (requireTable.tolerance != null && !(typeof requireTable.tolerance === 'number' && requireTable.tolerance >= 0)) {
        throw new Error('desmos_interactive.validation.state_rules.require_table.tolerance must be a number >= 0');
      }
    }
  }

  if (validation.expected_parameters != null) {
    if (!Array.isArray(validation.expected_parameters) || validation.expected_parameters.length === 0) {
      throw new Error('desmos_interactive.validation.expected_parameters must be a non-empty array');
    }
    for (const parameter of validation.expected_parameters) {
      if (!parameter || typeof parameter !== 'object' || Array.isArray(parameter)) {
        throw new Error('desmos_interactive.validation.expected_parameters entries must be objects');
      }
      if (typeof parameter.name !== 'string' || !parameter.name.trim()) {
        throw new Error('desmos_interactive.validation.expected_parameters entries require a name');
      }
      if (typeof parameter.value !== 'number' || !Number.isFinite(parameter.value)) {
        throw new Error(`desmos_interactive.validation.expected_parameters.${parameter.name}.value must be a finite number`);
      }
      if (parameter.tolerance != null && !(typeof parameter.tolerance === 'number' && parameter.tolerance >= 0)) {
        throw new Error(`desmos_interactive.validation.expected_parameters.${parameter.name}.tolerance must be a number >= 0`);
      }
    }
  }

  const feedback = content.feedback;
  if (!feedback || typeof feedback.success_message_html !== 'string' || typeof feedback.retry_message_html !== 'string') {
    throw new Error('desmos_interactive.feedback success and retry messages are required');
  }

  if (feedback.targeted_hints != null) {
    if (!Array.isArray(feedback.targeted_hints)) {
      throw new Error('desmos_interactive.feedback.targeted_hints must be an array');
    }
    for (const hint of feedback.targeted_hints) {
      if (!hint || !HINT_PRIORITY.includes(hint.trigger) || typeof hint.message_html !== 'string' || !hint.message_html.trim()) {
        throw new Error('desmos_interactive.feedback.targeted_hints entries must include a valid trigger and message_html');
      }
    }
  }

  if (feedback.attempt_based_hints != null) {
    if (!Array.isArray(feedback.attempt_based_hints)) {
      throw new Error('desmos_interactive.feedback.attempt_based_hints must be an array');
    }
    for (const hint of feedback.attempt_based_hints) {
      if (!hint || !Number.isInteger(hint.min_attempts) || hint.min_attempts < 1 || typeof hint.message_html !== 'string' || !hint.message_html.trim()) {
        throw new Error('desmos_interactive.feedback.attempt_based_hints entries must include min_attempts >= 1 and message_html');
      }
    }
  }

  if (feedback.reveal_solution_after_attempts != null && (!Number.isInteger(feedback.reveal_solution_after_attempts) || feedback.reveal_solution_after_attempts < 1)) {
    throw new Error('desmos_interactive.feedback.reveal_solution_after_attempts must be an integer >= 1');
  }
  if (feedback.solution_html != null && typeof feedback.solution_html !== 'string') {
    throw new Error('desmos_interactive.feedback.solution_html must be a string');
  }

  const progression = content.progression;
  if (!progression || typeof progression.require_success !== 'boolean') {
    throw new Error('desmos_interactive.progression.require_success must be a boolean');
  }

  return content;
}

function isMathRow(row, allowTextOnlyExpressions = false) {
  if (!row || typeof row.latex !== 'string' || !row.latex.trim()) return false;
  if (allowTextOnlyExpressions) return true;
  const isSliderRow = (row.type === 'slider' || Boolean(row.sliderBounds))
    && /^[A-Za-z][A-Za-z0-9_]*\s*=/.test(row.latex.trim());
  if (isSliderRow) return false;
  return row.type !== 'text';
}

function parseStudentRows(studentExpressions) {
  return (studentExpressions || [])
    .map((row) => {
      if (typeof row === 'string') {
        return { latex: row, hidden: false, type: 'expression' };
      }
      return {
        latex: String(row?.latex || ''),
        hidden: Boolean(row?.hidden),
        type: row?.type || 'expression',
        sliderBounds: row?.sliderBounds || null,
        regressionParameters: row?.regressionParameters || null,
      };
    })
    .filter((row) => row.latex.trim().length > 0);
}

// Table rows never carry a `latex` of their own, so parseStudentRows
// drops them; regression checks need them back. Desmos hands each
// table over as { type:'table', columns:[{latex, values:[…]}] } with
// the cell values as strings.
function parseStudentTables(studentExpressions) {
  return (studentExpressions || [])
    .filter((row) => row && typeof row === 'object' && row.type === 'table' && Array.isArray(row.columns))
    .map((row) => ({
      columns: row.columns.map((column) => String(column?.latex ?? '').trim()),
      rows: tableRowsOf(row.columns),
    }));
}

// Column-major cells → row tuples. Desmos keeps a trailing blank row
// in the editor, and a learner can leave a gap mid-table, so any row
// whose cells are all empty drops out.
function tableRowsOf(columns) {
  const values = columns.map((column) => (Array.isArray(column?.values) ? column.values : []));
  const height = values.reduce((max, list) => Math.max(max, list.length), 0);
  const rows = [];
  for (let i = 0; i < height; i += 1) {
    const cells = values.map((list) => String(list[i] ?? '').trim());
    if (cells.every((cell) => cell === '')) continue;
    rows.push(cells.map(parseNumericCell));
  }
  return rows;
}

// A table cell is a string that is usually a plain number but may be
// typed as an expression ("-3", "1/2", "\frac{1}{2}"). null when it
// isn't numeric at all — an unparseable cell can never match.
export function parseNumericCell(cell) {
  const raw = String(cell ?? '').trim();
  if (!raw) return null;
  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;
  const evaluated = evaluateWithSafeArithmeticFallback(raw, 0);
  return Number.isFinite(evaluated) ? evaluated : null;
}

// Desmos stores the regression operator as a bare "~"; \sim is accepted
// too so a pasted or hand-authored expression is not mistaken for a
// plain equation.
function isRegressionRow(row) {
  return /~|\\sim/.test(String(row?.latex || ''));
}

// Every constant Desmos fitted, across all regression rows. Constants
// supplied by a definition row (a=10-b) are deliberately absent —
// Desmos only reports what it solved for.
function fittedParameters(rows) {
  const values = new Map();
  for (const row of rows) {
    const parameters = row?.regressionParameters;
    if (!parameters || typeof parameters !== 'object') continue;
    for (const [name, value] of Object.entries(parameters)) {
      if (typeof value === 'number' && Number.isFinite(value)) values.set(name, value);
    }
  }
  return values;
}

// Order-insensitive: entering the same points in a different order
// produces the same fit, so row order is not part of the answer.
function tableRowsMatch(actualRows, expectedRows, tolerance) {
  if (actualRows.length !== expectedRows.length) return false;
  const remaining = [...actualRows];
  for (const expected of expectedRows) {
    const index = remaining.findIndex((actual) => (
      actual.length >= expected.length &&
      expected.every((cell, i) => (
        typeof actual[i] === 'number' && Math.abs(actual[i] - cell) <= tolerance
      ))
    ));
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return true;
}

function parseSliderValues(studentExpressions) {
  const sliderValues = new Map();
  for (const row of studentExpressions || []) {
    if (!row || typeof row !== 'object') continue;
    const latex = String(row.latex || '').trim();
    if (!latex || row.type === 'text') continue;
    const assignment = latex.match(/^([A-Za-z][A-Za-z0-9_]*)\s*=\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)$/i);
    const hasSliderMetadata = Boolean(row.sliderBounds) || row.type === 'slider';
    if (assignment && (hasSliderMetadata || /^[A-Za-z][A-Za-z0-9_]*$/.test(assignment[1]))) {
      sliderValues.set(assignment[1], Number(assignment[2]));
    }
  }
  return sliderValues;
}

function getRequiredCount(goal) {
  if (Number.isInteger(goal?.required_count) && goal.required_count > 0) return goal.required_count;
  if (goal?.type === 'multi_expression') return 2;
  return 1;
}

export function validateStateRules(studentExpressions, stateRules = {}) {
  const rows = parseStudentRows(studentExpressions);
  const tables = parseStudentTables(studentExpressions);
  const sliderValues = parseSliderValues(studentExpressions);
  const requireVisibleOnly = Boolean(stateRules.require_visible_only);
  const allowTextOnlyExpressions = Boolean(stateRules.allow_text_only_expressions);
  const consideredRows = rows
    .filter((row) => !requireVisibleOnly || !row.hidden)
    .filter((row) => isMathRow(row, allowTextOnlyExpressions));

  const reasons = [];

  if (stateRules.min_expressions != null && consideredRows.length < stateRules.min_expressions) {
    reasons.push('too_few_expressions');
  }

  if (stateRules.max_expressions != null && consideredRows.length > stateRules.max_expressions) {
    reasons.push('too_many_expressions');
  }

  const joinedLatex = consideredRows.map((row) => row.latex).join('\n');

  const missingRequiredVars = (stateRules.must_include_variables || [])
    .filter((variable) => !joinedLatex.includes(variable));
  if (missingRequiredVars.length > 0) {
    reasons.push('missing_required_variables');
  }

  const forbiddenVarsUsed = (stateRules.must_not_include_variables || [])
    .filter((variable) => joinedLatex.includes(variable));
  if (forbiddenVarsUsed.length > 0) {
    reasons.push('uses_forbidden_variables');
  }

  const requiredSliders = stateRules.required_sliders || [];
  const missingRequiredSliders = requiredSliders.filter((slider) => !sliderValues.has(slider));
  if ((stateRules.require_slider_creation || requiredSliders.length > 0) && missingRequiredSliders.length > 0) {
    reasons.push('missing_required_slider');
  }

  const initialValues = stateRules.slider_initial_values || {};
  const presentRequiredSliders = requiredSliders.filter((slider) => sliderValues.has(slider));
  const movedSliders = presentRequiredSliders.filter((slider) => {
    const current = sliderValues.get(slider);
    const initial = Object.prototype.hasOwnProperty.call(initialValues, slider) ? initialValues[slider] : 1;
    return Math.abs(current - initial) > 1e-9;
  });

  if (stateRules.forbid_default_slider_values_on_submit && presentRequiredSliders.length > 0 && movedSliders.length === 0) {
    reasons.push('slider_still_default');
  }

  if (stateRules.require_slider_movement && presentRequiredSliders.length > 0 && movedSliders.length === 0) {
    reasons.push('slider_not_moved');
  }

  // ── Regression workflow (plan 3.2) ──────────────────────────────
  const requireTable = stateRules.require_table;
  if (requireTable) {
    const expectedColumns = (requireTable.columns || []).map((name) => String(name).trim());
    const candidates = expectedColumns.length > 0
      ? tables.filter((table) => expectedColumns.every((name) => table.columns.includes(name)))
      : tables;
    const filled = candidates.filter((table) => table.rows.length > 0);
    if (filled.length === 0) {
      reasons.push('missing_table');
    } else if (Array.isArray(requireTable.rows)) {
      const tolerance = requireTable.tolerance ?? DEFAULT_TABLE_TOLERANCE;
      if (!filled.some((table) => tableRowsMatch(table.rows, requireTable.rows, tolerance))) {
        reasons.push('table_rows_mismatch');
      }
    }
  }

  const regressionRows = rows.filter(isRegressionRow);
  if (stateRules.require_regression && regressionRows.length === 0) {
    reasons.push('missing_regression');
  }

  return {
    success: reasons.length === 0,
    reasons,
    count: consideredRows.length,
    consideredRows,
    forbiddenVarsUsed,
    missingRequiredVars,
    sliderValues: Object.fromEntries(sliderValues.entries()),
    missingRequiredSliders,
    movedSliders,
    tables,
    regressionRows,
    fittedParameters: Object.fromEntries(fittedParameters(regressionRows).entries()),
  };
}

// Compare the constants Desmos actually fitted with what the lesson
// expects. Returns the failure reasons plus a per-parameter report the
// runtime shows under debug.
export function validateExpectedParameters(studentExpressions, expectedParameters = []) {
  const rows = parseStudentRows(studentExpressions);
  const fitted = fittedParameters(rows.filter(isRegressionRow));
  const reasons = [];
  const report = [];

  for (const expected of expectedParameters) {
    const name = String(expected.name);
    const tolerance = expected.tolerance ?? DEFAULT_PARAMETER_TOLERANCE;
    if (!fitted.has(name)) {
      // Either no regression fitted this constant, or a definition row
      // supplies it — Desmos reports only what it solved for.
      reasons.push('missing_parameter');
      report.push({ name, expected: expected.value, actual: null, ok: false });
      continue;
    }
    const actual = fitted.get(name);
    const ok = Math.abs(actual - expected.value) <= tolerance;
    if (!ok) reasons.push('parameter_mismatch');
    report.push({ name, expected: expected.value, actual, ok });
  }

  return { success: reasons.length === 0, reasons: [...new Set(reasons)], report };
}

function selectTargetedHint(content, context) {
  const configuredHints = content.feedback.targeted_hints || [];
  if (configuredHints.length === 0) return null;

  const applicable = new Set(context.reasons || []);

  if (context.expectedStartsWithYEquals && context.rows.some((row) => isLikelyMissingYEquals(row.latex))) {
    applicable.add('missing_y_equals');
  }

  if (context.rows.some((row) => hasLikelyParenthesesError(row.latex))) {
    applicable.add('likely_parentheses_error');
  }

  for (const trigger of HINT_PRIORITY) {
    if (!applicable.has(trigger)) continue;
    const configured = configuredHints.find((hint) => hint.trigger === trigger);
    if (configured) {
      return { trigger, message_html: configured.message_html };
    }
  }

  return null;
}

function isLikelyMissingYEquals(latex) {
  const normalized = normalizeExpression(latex);
  if (!normalized) return false;
  return !normalized.includes('=') && /[a-z0-9]/i.test(normalized);
}

function hasLikelyParenthesesError(latex) {
  const raw = String(latex || '');
  const normalized = raw.replace(/\s+/g, '');
  if (!normalized.includes('(') || normalized.includes(')(')) return false;
  return /^[^=]+=.*[a-zA-Z0-9][+\-][a-zA-Z0-9]+\([^)]+\)$/.test(normalized);
}

export function validateDesmosSubmission({ content, studentExpressions, evaluateAtX, attempts = 1 }) {
  parseDesmosInteractiveContent(content);

  const rows = parseStudentRows(studentExpressions);
  // Raw expressions, not `rows`: parseStudentRows drops tables (they
  // have no latex of their own) and the table rules need them.
  const stateCheck = validateStateRules(studentExpressions, content.validation.state_rules || {});
  const requiredCount = getRequiredCount(content.goal);

  if (content.goal?.type === 'multi_expression' && stateCheck.count < requiredCount) {
    return buildFailureResult(content, rows, ['missing_second_expression'], attempts);
  }

  if (!stateCheck.success) {
    return buildFailureResult(content, rows, stateCheck.reasons, attempts);
  }

  // Fitted-constant check (plan 3.2). It runs for every mode once the
  // state is structurally sound: the numbers Desmos assigned are the
  // outcome of the workflow, whatever else the block validates.
  const expectedParameters = content.validation.expected_parameters;
  if (Array.isArray(expectedParameters) && expectedParameters.length > 0) {
    const parameterCheck = validateExpectedParameters(rows, expectedParameters);
    if (!parameterCheck.success) {
      return {
        ...buildFailureResult(content, rows, parameterCheck.reasons, attempts),
        parameterReport: parameterCheck.report,
      };
    }
  }

  if (content.validation.mode === 'state') {
    return buildSuccessResult(content, stateCheck.count, attempts);
  }

  const inputs = stateCheck.consideredRows.map((row) => row.latex.trim()).filter(Boolean);
  if (inputs.length === 0) {
    return buildFailureResult(content, rows, ['too_few_expressions'], attempts);
  }

  const expected = content.validation.expected || [];

  if (content.validation.mode === 'compare_expressions') {
    if (inputs.length < 2) {
      return buildFailureResult(content, rows, ['missing_second_expression'], attempts);
    }
    if (inputs.length > 2) {
      return buildFailureResult(content, rows, ['too_many_expressions'], attempts);
    }

    const testValues = content.validation.test_values || [];
    const tolerance = content.validation.tolerance ?? DEFAULT_TOLERANCE;
    const comparable = areEquivalent(inputs[0], inputs[1], testValues, tolerance, evaluateAtX);
    if (comparable) return buildSuccessResult(content, 2, attempts);
    return buildFailureResult(content, rows, ['expressions_not_comparable'], attempts);
  }

  let matchedCount = 0;

  if (content.validation.mode === 'normalized') {
    const expectedSet = new Set(expected.map(normalizeExpression));
    for (const raw of inputs) {
      if (expectedSet.has(normalizeExpression(raw))) {
        matchedCount += 1;
      }
    }

    if (matchedCount >= requiredCount) {
      return buildSuccessResult(content, matchedCount, attempts);
    }
    return buildFailureResult(content, rows, ['mismatch'], attempts);
  }

  const testValues = content.validation.test_values || [];
  const tolerance = content.validation.tolerance ?? DEFAULT_TOLERANCE;
  const usedInputIndexes = new Set();
  const normalizedExpected = expected.map(normalizeExpression);

  for (let i = 0; i < inputs.length; i += 1) {
    const normalizedInput = normalizeExpression(inputs[i]);
    if (normalizedExpected.includes(normalizedInput)) {
      usedInputIndexes.add(i);
      matchedCount += 1;
      if (matchedCount >= requiredCount) {
        return buildSuccessResult(content, matchedCount, attempts);
      }
    }
  }

  for (const expectedExpr of expected) {
    for (let i = 0; i < inputs.length; i += 1) {
      if (usedInputIndexes.has(i)) continue;
      if (areEquivalent(inputs[i], expectedExpr, testValues, tolerance, evaluateAtX)) {
        usedInputIndexes.add(i);
        matchedCount += 1;
        break;
      }
    }
    if (matchedCount >= requiredCount) break;
  }

  if (matchedCount >= requiredCount) {
    return buildSuccessResult(content, matchedCount, attempts);
  }

  return buildFailureResult(content, rows, ['mismatch'], attempts);
}

function buildSuccessResult(content, matchedCount, attempts) {
  const feedback = resolveFeedbackForAttempts({
    content,
    attempts,
    success: true,
    hint: null,
  });
  return {
    success: true,
    matchedCount,
    reason: 'ok',
    reasons: [],
    ...feedback,
  };
}

function buildFailureResult(content, rows, reasons, attempts) {
  const expectedStartsWithYEquals = (content.validation.expected || []).some((expr) => normalizeExpression(expr).startsWith('y='));
  const hint = selectTargetedHint(content, { rows, reasons, expectedStartsWithYEquals });
  const feedback = resolveFeedbackForAttempts({
    content,
    attempts,
    success: false,
    hint,
  });

  return {
    success: false,
    matchedCount: 0,
    reason: reasons[0] || 'mismatch',
    reasons,
    hintTrigger: hint?.trigger || null,
    ...feedback,
  };
}

function resolveFeedbackForAttempts({ content, attempts, success, hint }) {
  const attemptHints = [...(content.feedback.attempt_based_hints || [])]
    .sort((a, b) => b.min_attempts - a.min_attempts);
  const attemptHint = attemptHints.find((entry) => attempts >= entry.min_attempts) || null;
  const showSolution = Number.isInteger(content.feedback.reveal_solution_after_attempts)
    && attempts >= content.feedback.reveal_solution_after_attempts
    && typeof content.feedback.solution_html === 'string'
    && content.feedback.solution_html.trim().length > 0;

  if (success) {
    return {
      feedbackHtml: content.feedback.success_message_html,
      feedbackType: 'success',
      progressiveHintHtml: null,
      solutionHtml: showSolution ? content.feedback.solution_html : null,
    };
  }

  if (hint) {
    return {
      feedbackHtml: hint.message_html,
      feedbackType: 'targeted',
      progressiveHintHtml: attemptHint ? attemptHint.message_html : null,
      solutionHtml: showSolution ? content.feedback.solution_html : null,
    };
  }

  if (attemptHint) {
    return {
      feedbackHtml: attemptHint.message_html,
      feedbackType: 'attempt',
      progressiveHintHtml: null,
      solutionHtml: showSolution ? content.feedback.solution_html : null,
    };
  }

  return {
    feedbackHtml: content.feedback.retry_message_html,
    feedbackType: 'retry',
    progressiveHintHtml: null,
    solutionHtml: showSolution ? content.feedback.solution_html : null,
  };
}

export function areEquivalent(studentExpr, expectedExpr, testValues, tolerance, evaluateAtX) {
  for (const x of testValues) {
    const studentVal = evaluateExpressionAtX(studentExpr, x, evaluateAtX);
    const expectedVal = evaluateExpressionAtX(expectedExpr, x, evaluateAtX);

    if (!Number.isFinite(studentVal) || !Number.isFinite(expectedVal)) {
      return false;
    }

    if (Math.abs(studentVal - expectedVal) > tolerance) {
      return false;
    }
  }

  return true;
}

function evaluateExpressionAtX(expression, x, evaluateAtX) {
  if (typeof evaluateAtX === 'function') {
    const direct = evaluateAtX(expression, x);
    if (Number.isFinite(direct)) return direct;
  }

  return evaluateWithSafeArithmeticFallback(expression, x);
}

function evaluateWithSafeArithmeticFallback(rawExpression, x) {
  const rhs = String(rawExpression || '').split('=').pop();
  if (!rhs) return NaN;

  const cleaned = latexToInfix(rhs)
    .toLowerCase()
    .replace(/\s+/g, '');

  if (!/^[0-9x+\-*/().^]+$/.test(cleaned)) return NaN;

  const withImplicitMultiplication = cleaned
    .replace(/(\d|x|\))(?=\(|x|\d)/g, '$1*')
    .replace(/\^/g, '**');

  if (!/^[0-9x+\-*/().*]+$/.test(withImplicitMultiplication)) return NaN;

  try {
    const fn = new Function('x', `"use strict"; return (${withImplicitMultiplication});`);
    const result = fn(x);
    return Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

export const DESMOS_INTERACTIVE_EXAMPLE_CONTENT = {
  id: 'block_desmos_1',
  type: 'desmos_interactive',
  title: 'Graph the first equation',
  instructions_html: '<p>Type <strong>y=(x+1)(x-3)</strong> into Desmos.</p>',
  caption_html: '<p>Look at the graph carefully.</p>',
  initial_expressions: [],
  calculator_options: {
    expressions: true,
    lockViewport: false,
    sliders: true,
  },
  goal: {
    type: 'enter_expression',
    required_count: 1,
  },
  validation: {
    mode: 'equivalent',
    state_rules: {
      min_expressions: 1,
      max_expressions: 1,
      require_visible_only: true,
    },
    expected: ['y=(x+1)(x-3)'],
    test_values: [-2, 0, 2, 4],
    tolerance: 0.000001,
  },
  feedback: {
    success_message_html: '<p>Nice. That matches the target expression.</p>',
    retry_message_html: '<p>That doesn\'t seem to match yet. Check signs, parentheses, and exponents.</p>',
    targeted_hints: [
      {
        trigger: 'missing_y_equals',
        message_html: '<p>Start by typing <strong>y =</strong> before the expression.</p>',
      },
    ],
  },
  progression: {
    require_success: true,
  },
};

export const DESMOS_INTERACTIVE_SLIDER_SETUP_EXAMPLE = {
  id: 'block_slider_setup_xy',
  type: 'desmos_interactive',
  title: 'Set up sliders for X and Y',
  instructions_html: '<p>Enter the expression using <strong>X</strong> and <strong>Y</strong>, and make sure Desmos creates sliders for both variables.</p>',
  caption_html: '<p>Use uppercase letters so sliders can be created.</p>',
  initial_expressions: [],
  goal: { type: 'enter_expression', required_count: 1 },
  validation: {
    mode: 'state',
    state_rules: {
      min_expressions: 1,
      max_expressions: 1,
      require_visible_only: true,
      must_include_variables: ['X', 'Y'],
      must_not_include_variables: ['x', 'y'],
      required_sliders: ['X', 'Y'],
      require_slider_creation: true,
    },
  },
  feedback: {
    success_message_html: '<p>Good. Both sliders are ready.</p>',
    retry_message_html: '<p>Your setup needs one more fix.</p>',
    targeted_hints: [
      {
        trigger: 'uses_forbidden_variables',
        message_html: '<p>Use uppercase <strong>X</strong> and <strong>Y</strong> so Desmos can create sliders.</p>',
      },
      {
        trigger: 'missing_required_slider',
        message_html: '<p>Make sure both <strong>X</strong> and <strong>Y</strong> appear as sliders.</p>',
      },
    ],
  },
  progression: { require_success: true },
};

export const DESMOS_INTERACTIVE_SLIDER_MOVE_EXAMPLE = {
  id: 'block_slider_move_xy',
  type: 'desmos_interactive',
  title: 'Test the expression with new slider values',
  instructions_html: '<p>Change the values of <strong>X</strong> and <strong>Y</strong> before checking your setup.</p>',
  caption_html: '<p>Do not leave both sliders at 1.</p>',
  initial_expressions: [{ id: 'expr1', latex: '6X^2Y^2(X^6+2)' }],
  goal: { type: 'enter_expression', required_count: 1 },
  validation: {
    mode: 'state',
    state_rules: {
      min_expressions: 1,
      max_expressions: 1,
      require_visible_only: true,
      required_sliders: ['X', 'Y'],
      require_slider_creation: true,
      require_slider_movement: true,
      slider_initial_values: { X: 1, Y: 1 },
      forbid_default_slider_values_on_submit: true,
    },
  },
  feedback: {
    success_message_html: '<p>Nice. You changed the sliders and tested a non-default case.</p>',
    retry_message_html: '<p>Try interacting with the sliders before continuing.</p>',
    targeted_hints: [
      {
        trigger: 'missing_required_slider',
        message_html: '<p>Create sliders for <strong>X</strong> and <strong>Y</strong> first.</p>',
      },
      {
        trigger: 'slider_still_default',
        message_html: '<p>Both sliders are still at their default values. Change them before checking.</p>',
      },
      {
        trigger: 'slider_not_moved',
        message_html: '<p>Move the sliders to test the expression with new values.</p>',
      },
    ],
  },
  progression: { require_success: true },
};

export const DESMOS_INTERACTIVE_GRAPH_COMPARE_EXAMPLE = {
  id: 'block_graph_compare',
  type: 'desmos_interactive',
  title: 'Compare two expressions',
  instructions_html: '<p>Enter the original expression and one answer choice. Compare them.</p>',
  initial_expressions: [],
  goal: {
    type: 'multi_expression',
    required_count: 2,
    roles: ['original', 'candidate'],
  },
  validation: {
    mode: 'compare_expressions',
    comparison: 'equivalent',
    test_values: [-2, 0, 2, 4],
    tolerance: 0.000001,
    state_rules: {
      min_expressions: 2,
      max_expressions: 2,
      require_visible_only: true,
    },
  },
  feedback: {
    success_message_html: '<p>These expressions match.</p>',
    retry_message_html: '<p>These do not match yet.</p>',
    targeted_hints: [
      {
        trigger: 'missing_second_expression',
        message_html: '<p>Enter both expressions before checking.</p>',
      },
      {
        trigger: 'too_many_expressions',
        message_html: '<p>Only compare one answer choice at a time.</p>',
      },
    ],
    attempt_based_hints: [
      {
        min_attempts: 2,
        message_html: '<p>Try simplifying both expressions before comparing.</p>',
      },
      {
        min_attempts: 3,
        message_html: '<p>Check signs and parentheses in each expression.</p>',
      },
    ],
    reveal_solution_after_attempts: 4,
    solution_html: '<p>Correct setup: enter exactly two expressions, then compare them.</p>',
  },
  progression: { require_success: true },
};

export const DESMOS_INTERACTIVE_VARIABLE_RENAME_EXAMPLE = DESMOS_INTERACTIVE_SLIDER_SETUP_EXAMPLE;

// Custom-regression gate (plan 3.2): the learner enters the data as a
// table, fits it with a `~` model, and Desmos assigns the constant.
// The block validates all three, so the workflow itself is the answer.
export const DESMOS_INTERACTIVE_REGRESSION_EXAMPLE = {
  id: 'block_custom_regression',
  type: 'desmos_interactive',
  title: 'Fit the missing constant',
  instructions_html: '<p>Enter the points <strong>(2,5)</strong> and <strong>(4,17)</strong> in a table, then add the custom regression <strong>y_1~a(x_1-2)^2+5</strong>.</p>',
  initial_expressions: [],
  goal: { type: 'enter_expression', required_count: 1 },
  validation: {
    mode: 'state',
    state_rules: {
      require_table: { columns: ['x_1', 'y_1'], rows: [[2, 5], [4, 17]] },
      require_regression: true,
    },
    expected_parameters: [{ name: 'a', value: 3 }],
  },
  feedback: {
    success_message_html: '<p>Desmos assigned <strong>a = 3</strong>.</p>',
    retry_message_html: '<p>Check the table and the regression line, then submit again.</p>',
    targeted_hints: [
      { trigger: 'missing_table', message_html: '<p>Add the data with <strong>Add Item (+) → Table</strong> first.</p>' },
      { trigger: 'table_rows_mismatch', message_html: '<p>The table rows do not match the two given points yet.</p>' },
      { trigger: 'missing_regression', message_html: '<p>Add a row using <strong>~</strong> in place of <strong>=</strong>.</p>' },
      { trigger: 'missing_parameter', message_html: '<p>Desmos is not assigning a value yet — check that the regression uses the table\'s column names.</p>' },
      { trigger: 'parameter_mismatch', message_html: '<p>Desmos assigned a different value. Re-check the model against the required form.</p>' },
    ],
  },
  progression: { require_success: true },
};

export function isLessonCompletionLocked(blocks, completedBlockIds) {
  const completed = new Set(completedBlockIds || []);
  for (const block of blocks || []) {
    if (block?.block_type === 'desmos_interactive'
      && block?.content?.progression?.require_success
      && !completed.has(block.id)) {
      return true;
    }
  }
  return false;
}
