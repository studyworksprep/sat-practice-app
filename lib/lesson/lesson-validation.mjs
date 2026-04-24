import { parseDesmosInteractiveContent } from './desmos-interactive.mjs';

function makeIssue(severity, code, message, { blockId = null, path = null, suggestion = null } = {}) {
  return { severity, code, message, blockId, path, suggestion };
}

function readMeta(block, key) {
  return block?.[key] ?? block?.content?.[key] ?? null;
}

function blockIdOf(block, index) {
  return String(block?.id ?? readMeta(block, 'id') ?? `index:${index}`);
}

export function validateLessonBlocks(blocks = []) {
  const errors = [];
  const warnings = [];
  const list = Array.isArray(blocks) ? blocks : [];
  const idSet = new Set(list.map((b, i) => blockIdOf(b, i)));
  const workflows = new Map();

  const add = (issue) => {
    if (issue.severity === 'error') errors.push(issue);
    else warnings.push(issue);
  };

  list.forEach((block, index) => {
    const blockId = blockIdOf(block, index);
    if (!block?.block_type) {
      add(makeIssue('error', 'block_type_required', 'Each block must include block_type.', {
        blockId,
        path: 'block_type',
        suggestion: 'Set block_type to text, video, check, question_link, or desmos_interactive.',
      }));
      return;
    }

    if (block.block_type === 'desmos_interactive') {
      try {
        const content = parseDesmosInteractiveContent(block.content || {});

        const mode = content.validation?.mode;
        const goalType = content.goal?.type;
        const requiredCount = content.goal?.required_count ?? (goalType === 'multi_expression' ? 2 : 1);

        if (goalType === 'multi_expression' && requiredCount < 2) {
          add(makeIssue('warning', 'multi_expression_required_count_low', 'multi_expression usually needs required_count >= 2.', {
            blockId,
            path: 'content.goal.required_count',
            suggestion: 'Set required_count to 2 unless you intentionally want single-expression behavior.',
          }));
        }

        if ((mode === 'equivalent' || mode === 'normalized') && Array.isArray(content.validation.expected)) {
          for (const expr of content.validation.expected) {
            const normalized = String(expr || '').replace(/\s+/g, '').toLowerCase();
            if (normalized && !normalized.includes('=') && /[a-z]/i.test(normalized)) {
              add(makeIssue('warning', 'expected_missing_equals', 'Expected expression may be missing an explicit equation (e.g. y=...).', {
                blockId,
                path: 'content.validation.expected',
                suggestion: 'Use y=... for graphing checks unless a pure expression is intentional.',
              }));
              break;
            }
          }
        }

        if (mode === 'compare_expressions') {
          if (!Array.isArray(content.validation.test_values) || content.validation.test_values.length === 0) {
            add(makeIssue('error', 'compare_missing_test_values', 'compare_expressions requires test_values array.', {
              blockId,
              path: 'content.validation.test_values',
              suggestion: 'Add numeric x test values (e.g. [-2,0,2,4]).',
            }));
          }
          if (requiredCount !== 2) {
            add(makeIssue('warning', 'compare_required_count_not_two', 'compare_expressions is designed for exactly two expressions.', {
              blockId,
              path: 'content.goal.required_count',
              suggestion: 'Set goal.required_count to 2.',
            }));
          }
          const min = content.validation?.state_rules?.min_expressions;
          const max = content.validation?.state_rules?.max_expressions;
          if (min != null && min !== 2) {
            add(makeIssue('warning', 'compare_min_not_two', 'compare_expressions should require min_expressions=2.', {
              blockId,
              path: 'content.validation.state_rules.min_expressions',
              suggestion: 'Set min_expressions to 2 to avoid partial input.',
            }));
          }
          if (max != null && max !== 2) {
            add(makeIssue('warning', 'compare_max_not_two', 'compare_expressions should cap max_expressions=2.', {
              blockId,
              path: 'content.validation.state_rules.max_expressions',
              suggestion: 'Set max_expressions to 2 to prevent extra expression rows from failing checks.',
            }));
          }
        }

        const includeVars = content.validation?.state_rules?.must_include_variables || [];
        const forbidVars = content.validation?.state_rules?.must_not_include_variables || [];
        if (includeVars.includes('X') && includeVars.includes('Y')) {
          if (!forbidVars.includes('x') || !forbidVars.includes('y')) {
            add(makeIssue('warning', 'slider_xy_case_guard_missing', 'Slider workflow expects uppercase X/Y but lowercase x/y are not blocked.', {
              blockId,
              path: 'content.validation.state_rules.must_not_include_variables',
              suggestion: 'Add x and y to must_not_include_variables for uppercase slider lessons.',
            }));
          }
        }

        if (readMeta(block, 'inherit_from_previous_workflow_desmos')) {
          const workflowId = readMeta(block, 'workflow_id');
          if (workflowId) {
            const prior = list.slice(0, index).some((candidate) => readMeta(candidate, 'workflow_id') === workflowId);
            if (!prior) {
              add(makeIssue('warning', 'inherit_without_prior', 'inherit_from_previous_workflow_desmos is true but no prior block exists in this workflow.', {
                blockId,
                path: 'content.inherit_from_previous_workflow_desmos',
                suggestion: 'Set inherit_from_previous_workflow_desmos=false or place this block after another block in the same workflow.',
              }));
            }
          }
        }
      } catch (err) {
        add(makeIssue('error', 'desmos_schema_invalid', err.message, {
          blockId,
          path: 'content',
          suggestion: 'Open the block editor and fix required desmos_interactive fields.',
        }));
      }
    }

    const workflowId = readMeta(block, 'workflow_id');
    if (workflowId) {
      const bucket = workflows.get(workflowId) || [];
      bucket.push({ block, index, blockId, stepIndex: readMeta(block, 'step_index'), totalSteps: readMeta(block, 'total_steps') });
      workflows.set(workflowId, bucket);
    }
  });

  for (const [workflowId, items] of workflows.entries()) {
    const seenStepIndex = new Set();
    let previous = -Infinity;
    let expectedTotal = null;

    for (const item of [...items].sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0))) {
      const { blockId, stepIndex, totalSteps } = item;
      if (!Number.isInteger(stepIndex) || stepIndex < 1) {
        add(makeIssue('warning', 'workflow_step_index_missing', 'Workflow block is missing a valid step_index.', {
          blockId,
          path: 'content.step_index',
          suggestion: 'Set a 1-based integer step_index for workflow ordering.',
        }));
      } else {
        if (seenStepIndex.has(stepIndex)) {
          add(makeIssue('error', 'workflow_step_index_duplicate', `Duplicate step_index ${stepIndex} in workflow ${workflowId}.`, {
            blockId,
            path: 'content.step_index',
            suggestion: 'Use unique step_index values within each workflow_id.',
          }));
        }
        seenStepIndex.add(stepIndex);
        if (stepIndex < previous) {
          add(makeIssue('warning', 'workflow_out_of_order', `Workflow ${workflowId} appears out of order.`, {
            blockId,
            path: 'content.step_index',
            suggestion: 'Sort workflow steps by increasing step_index.',
          }));
        }
        previous = stepIndex;
      }

      if (totalSteps == null) {
        add(makeIssue('warning', 'workflow_total_steps_missing', 'Workflow step is missing total_steps.', {
          blockId,
          path: 'content.total_steps',
          suggestion: 'Set total_steps to improve authoring clarity and debug displays.',
        }));
      } else if (!Number.isInteger(totalSteps) || totalSteps < 1) {
        add(makeIssue('warning', 'workflow_total_steps_invalid', 'total_steps should be a positive integer.', {
          blockId,
          path: 'content.total_steps',
          suggestion: 'Use an integer such as 3 or 4.',
        }));
      } else if (expectedTotal == null) {
        expectedTotal = totalSteps;
      } else if (expectedTotal !== totalSteps) {
        add(makeIssue('warning', 'workflow_total_steps_inconsistent', `Workflow ${workflowId} has inconsistent total_steps values.`, {
          blockId,
          path: 'content.total_steps',
          suggestion: `Use total_steps=${expectedTotal} for all steps in workflow ${workflowId}.`,
        }));
      }
    }
  }

  list.forEach((block, index) => {
    const blockId = blockIdOf(block, index);
    const onCorrect = readMeta(block, 'on_correct_block_id');
    const onIncorrect = readMeta(block, 'on_incorrect_block_id');
    const rejoin = readMeta(block, 'rejoin_at_block_id');

    if (onCorrect && !idSet.has(String(onCorrect))) {
      add(makeIssue('error', 'branch_on_correct_missing_target', `on_correct_block_id points to missing block ${onCorrect}.`, {
        blockId,
        path: 'content.on_correct_block_id',
        suggestion: 'Use an existing block id.',
      }));
    }
    if (onIncorrect && !idSet.has(String(onIncorrect))) {
      add(makeIssue('error', 'branch_on_incorrect_missing_target', `on_incorrect_block_id points to missing block ${onIncorrect}.`, {
        blockId,
        path: 'content.on_incorrect_block_id',
        suggestion: 'Use an existing block id.',
      }));
    }
    if (rejoin && !idSet.has(String(rejoin))) {
      add(makeIssue('error', 'branch_rejoin_missing_target', `rejoin_at_block_id points to missing block ${rejoin}.`, {
        blockId,
        path: 'content.rejoin_at_block_id',
        suggestion: 'Use an existing block id.',
      }));
    }

    if ((onCorrect || onIncorrect) && !rejoin) {
      add(makeIssue('warning', 'branch_missing_rejoin', 'Branching block has no rejoin target.', {
        blockId,
        path: 'content.rejoin_at_block_id',
        suggestion: 'Set rejoin_at_block_id so the workflow merges back cleanly.',
      }));
    }

    const hasLinearNext = index < list.length - 1;
    const hasAnyPath = Boolean(hasLinearNext || onCorrect || onIncorrect || rejoin);
    if (!hasAnyPath) {
      add(makeIssue('warning', 'dead_end_block', 'Block has no obvious next path (potential dead end).', {
        blockId,
        path: 'content',
        suggestion: 'Add a next block, branch target, or explicit completion behavior.',
      }));
    }
  });

  const workflowText = [...workflows.entries()].map(([workflowId, items]) => {
    const ordered = [...items].sort((a, b) => Number(a.stepIndex ?? 9999) - Number(b.stepIndex ?? 9999));
    const path = ordered.map((item) => String(item.stepIndex ?? '?')).join(' -> ');
    return `Workflow ${workflowId}: ${path}`;
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
      blockCount: list.length,
      workflowCount: workflows.size,
    },
    workflowVisualization: workflowText,
  };
}
