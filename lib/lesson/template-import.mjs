import { createDesmosTemplate } from './desmos-form-utils.mjs';
import {
  createBranchingQuestionTemplate,
  createGraphComparisonWorkflow,
  createIdGenerator,
  createSliderWorkflow,
} from './template-registry.mjs';
import { recomputeSortOrders } from './editor-utils.mjs';

function issue(severity, path, message, suggestion = null) {
  return { severity, path, message, suggestion };
}

const BRANCH_FIELDS = ['on_correct_block_id', 'on_incorrect_block_id', 'rejoin_at_block_id'];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueContentId(id, used) {
  if (!id) return id;
  let candidate = String(id);
  let count = 1;
  while (used.has(candidate)) {
    count += 1;
    candidate = `${id}_${count}`;
  }
  used.add(candidate);
  return candidate;
}

function assignUniqueBlockIds(blocks, generator) {
  const idMap = new Map();
  const next = blocks.map((block) => {
    const desired = String(block.id || block.content?.id || block.block_type || 'block');
    const generated = generator(desired);
    idMap.set(String(block.id), generated);
    return { ...block, id: generated };
  });

  return next.map((block) => {
    const content = { ...(block.content || {}) };
    for (const key of BRANCH_FIELDS) {
      if (content[key] && idMap.has(String(content[key]))) {
        content[key] = idMap.get(String(content[key]));
      }
    }
    return { ...block, content };
  });
}

function assignUniqueContentIds(blocks, usedContentIds) {
  return blocks.map((block) => {
    const content = { ...(block.content || {}) };
    if (content.id) content.id = uniqueContentId(content.id, usedContentIds);
    return { ...block, content };
  });
}

function compileTextBlock(specBlock, idx) {
  if (!specBlock.html) {
    return { blocks: [], issues: [issue('error', `blocks[${idx}].html`, 'text kind requires html.', 'Add html like "<p>Intro</p>".')] };
  }

  return {
    blocks: [{
      id: specBlock.id || `text_${idx + 1}`,
      block_type: 'text',
      content: {
        id: specBlock.id || `text_${idx + 1}`,
        html: specBlock.html,
        explanation_html: specBlock.explanation_html || undefined,
      },
    }],
    issues: [],
  };
}

function compileDesmosEnter(specBlock, idx) {
  const required = ['instructions_html', 'expression'];
  const missing = required.filter((field) => !specBlock[field]);
  if (missing.length > 0) {
    return {
      blocks: [],
      issues: missing.map((field) => issue('error', `blocks[${idx}].${field}`, `desmos_enter_expression requires ${field}.`)),
    };
  }

  const template = createDesmosTemplate('enter');
  template.id = specBlock.id || `desmos_enter_${idx + 1}`;
  template.title = specBlock.title || 'Enter expression';
  template.instructions_html = specBlock.instructions_html;
  const expected = specBlock.expected_expression || specBlock.expression;
  template.validation.expected = [expected];
  template.validation.test_values = Array.isArray(specBlock.test_values) && specBlock.test_values.length > 0 ? specBlock.test_values : [-2, 0, 2];
  template.progression.require_success = specBlock.require_success !== false;

  const issues = [];
  if (!String(specBlock.expression).includes('=')) {
    issues.push(issue('warning', `blocks[${idx}].expression`, 'Expression may be missing y= for graphing.', 'Use y=... if graphing is intended.'));
  }

  return {
    blocks: [{ id: template.id, block_type: 'desmos_interactive', content: template }],
    issues,
  };
}

function compileGraphWorkflow(specBlock, idx, existingIds) {
  const issues = [];
  if (!specBlock.original_expression) issues.push(issue('error', `blocks[${idx}].original_expression`, 'graph_comparison_workflow requires original_expression.', 'Add original_expression like "y=(x+1)(x-3)".'));
  if (!specBlock.candidate_expression) issues.push(issue('error', `blocks[${idx}].candidate_expression`, 'graph_comparison_workflow requires candidate_expression.', 'Add candidate_expression like "y=x^2-2x-3".'));
  if (!specBlock.prompt_html) issues.push(issue('warning', `blocks[${idx}].prompt_html`, 'Graph comparison workflow has no prompt_html.'));
  if (issues.some((i) => i.severity === 'error')) return { blocks: [], issues };

  const workflowId = specBlock.id || `graph_workflow_${idx + 1}`;
  const blocks = createGraphComparisonWorkflow({
    workflowId,
    originalExpression: specBlock.original_expression,
    candidateExpression: specBlock.candidate_expression,
  }, { existingIds });

  if (specBlock.prompt_html && blocks[0]?.content) blocks[0].content.instructions_html = specBlock.prompt_html;
  if (specBlock.correct_html && blocks[4]?.content) blocks[4].content.html = specBlock.correct_html;
  if (specBlock.incorrect_html && blocks[5]?.content) blocks[5].content.html = specBlock.incorrect_html;

  return { blocks, issues };
}

function compileSliderWorkflow(specBlock, idx, existingIds) {
  const workflowId = specBlock.id || `slider_workflow_${idx + 1}`;
  const blocks = createSliderWorkflow({ workflowId }, { existingIds });
  const issues = [];

  const vars = ensureArray(specBlock.variables);
  if (vars.some((variable) => ['x', 'y'].includes(String(variable)))) {
    issues.push(issue('warning', `blocks[${idx}].variables`, 'Slider workflow uses lowercase x/y variables.', 'Prefer uppercase X/Y to create sliders.'));
  }

  if (specBlock.expression && blocks[0]?.content) {
    const expression = String(specBlock.expression);
    blocks[0].content.instructions_html = `<p>Enter <strong>${expression}</strong> and create sliders.</p>`;
  }
  if (specBlock.prompt_html && blocks[0]?.content) blocks[0].content.instructions_html = specBlock.prompt_html;

  return { blocks, issues };
}

function compileBranchingQuestion(specBlock, idx, existingIds) {
  const issues = [];
  if (!specBlock.question_html) issues.push(issue('error', `blocks[${idx}].question_html`, 'branching_question requires question_html.'));
  if (!Array.isArray(specBlock.choices) || specBlock.choices.length < 2) issues.push(issue('error', `blocks[${idx}].choices`, 'branching_question requires choices array with at least 2 options.'));

  const choiceIds = new Set((specBlock.choices || []).map((choice) => choice.id));
  if (!specBlock.correct_choice_id || !choiceIds.has(specBlock.correct_choice_id)) {
    issues.push(issue('error', `blocks[${idx}].correct_choice_id`, 'correct_choice_id must exist in choices.', 'Set correct_choice_id to one of choice ids.'));
  }
  if (issues.some((entry) => entry.severity === 'error')) return { blocks: [], issues };

  const baseId = specBlock.id || `branching_question_${idx + 1}`;
  const choices = specBlock.choices.map((choice) => choice.text);
  const correctIndex = specBlock.choices.findIndex((choice) => choice.id === specBlock.correct_choice_id);

  const blocks = createBranchingQuestionTemplate({
    baseId,
    prompt: specBlock.question_html,
    choices,
    correctIndex,
  }, { existingIds });

  if (specBlock.correct_html) blocks[1].content.html = specBlock.correct_html;
  if (specBlock.incorrect_html) blocks[2].content.html = specBlock.incorrect_html;
  if (specBlock.rejoin_html) blocks[3].content.html = specBlock.rejoin_html;
  if (specBlock.explanation_html) blocks[0].content.explanation = specBlock.explanation_html;

  return { blocks, issues };
}

function compileRawBlock(specBlock, idx) {
  if (!specBlock.block_type) return { blocks: [], issues: [issue('error', `blocks[${idx}].block_type`, 'raw_block requires block_type.')] };
  if (!specBlock.content || typeof specBlock.content !== 'object') return { blocks: [], issues: [issue('error', `blocks[${idx}].content`, 'raw_block requires object content.')] };
  return {
    blocks: [{ id: specBlock.id || `raw_${idx + 1}`, block_type: specBlock.block_type, content: specBlock.content }],
    issues: [],
  };
}

export function compileLessonTemplateSpec(spec, options = {}) {
  const issues = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return {
      lessonMetadata: {},
      blocks: [],
      issues: [issue('error', '$', 'LessonTemplateSpec must be a JSON object.')],
    };
  }

  if (!Array.isArray(spec.blocks)) {
    return {
      lessonMetadata: { title: spec.title, description: spec.description },
      blocks: [],
      issues: [issue('error', 'blocks', 'LessonTemplateSpec requires blocks array.')],
    };
  }

  if (!spec.title) issues.push(issue('warning', 'title', 'Spec is missing title.'));
  if (!spec.description) issues.push(issue('warning', 'description', 'Spec is missing description.'));

  const existingBlockIds = ensureArray(options.existingBlockIds).map(String);
  const existingContentIds = new Set(ensureArray(options.existingContentIds).map(String));
  const blockIdGenerator = createIdGenerator(existingBlockIds);

  const compiledBlocks = [];
  const seenSpecIds = new Set();

  spec.blocks.forEach((specBlock, idx) => {
    if (!specBlock || typeof specBlock !== 'object' || Array.isArray(specBlock)) {
      issues.push(issue('error', `blocks[${idx}]`, 'Each block spec must be an object.'));
      return;
    }

    if (!specBlock.kind) {
      issues.push(issue('error', `blocks[${idx}].kind`, 'Block spec requires kind.'));
      return;
    }

    if (specBlock.id) {
      if (seenSpecIds.has(specBlock.id)) {
        issues.push(issue('warning', `blocks[${idx}].id`, `Duplicate spec id "${specBlock.id}" detected; collisions will be resolved automatically.`));
      }
      seenSpecIds.add(specBlock.id);
    }

    let result;
    const kind = String(specBlock.kind);
    if (kind === 'text') result = compileTextBlock(specBlock, idx);
    else if (kind === 'desmos_enter_expression') result = compileDesmosEnter(specBlock, idx);
    else if (kind === 'graph_comparison_workflow') result = compileGraphWorkflow(specBlock, idx, [...existingBlockIds, ...compiledBlocks.map((block) => block.id)]);
    else if (kind === 'slider_workflow') result = compileSliderWorkflow(specBlock, idx, [...existingBlockIds, ...compiledBlocks.map((block) => block.id)]);
    else if (kind === 'branching_question') result = compileBranchingQuestion(specBlock, idx, [...existingBlockIds, ...compiledBlocks.map((block) => block.id)]);
    else if (kind === 'raw_block') result = compileRawBlock(specBlock, idx);
    else {
      issues.push(issue('error', `blocks[${idx}].kind`, `Unknown kind "${kind}".`, 'Use one of: text, desmos_enter_expression, graph_comparison_workflow, slider_workflow, branching_question, raw_block.'));
      return;
    }

    issues.push(...result.issues);
    compiledBlocks.push(...result.blocks);
  });

  let uniqueBlocks = assignUniqueBlockIds(compiledBlocks, blockIdGenerator);
  uniqueBlocks = assignUniqueContentIds(uniqueBlocks, existingContentIds);
  uniqueBlocks = recomputeSortOrders(uniqueBlocks);

  return {
    lessonMetadata: {
      title: spec.title || undefined,
      description: spec.description || undefined,
    },
    blocks: uniqueBlocks,
    issues,
  };
}

export function applyImportedBlocks(existingBlocks, importedBlocks, mode = 'append', selectedIndex = 0) {
  const source = ensureArray(existingBlocks);
  const imported = ensureArray(importedBlocks);
  let next;

  if (mode === 'replace_all') {
    next = [...imported];
  } else if (mode === 'insert_after_selected') {
    const left = source.slice(0, selectedIndex + 1);
    const right = source.slice(selectedIndex + 1);
    next = [...left, ...imported, ...right];
  } else {
    next = [...source, ...imported];
  }

  return recomputeSortOrders(next);
}

export function parseLessonTemplateSpecText(rawText) {
  try {
    return { spec: JSON.parse(rawText), error: null };
  } catch (err) {
    return { spec: null, error: err.message };
  }
}
