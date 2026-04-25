import { DESMOS_INTERACTIVE_EXAMPLE_CONTENT } from './desmos-interactive.mjs';

export function recomputeSortOrders(blocks = []) {
  return (blocks || []).map((block, index) => ({
    ...block,
    sort_order: index,
  }));
}

export function createStarterBlock(type = 'text', index = 0) {
  const suffix = `${Date.now()}_${index}`;
  if (type === 'check') {
    return {
      id: `new_check_block_${suffix}`,
      block_type: 'check',
      sort_order: index,
      content: {
        id: `new_check_block_${suffix}`,
        prompt: 'New check question',
        choices: ['Choice A', 'Choice B'],
        correct_index: 0,
        explanation: '',
      },
    };
  }

  if (type === 'desmos_interactive') {
    return {
      id: `new_desmos_block_${suffix}`,
      block_type: 'desmos_interactive',
      sort_order: index,
      content: {
        ...structuredClone(DESMOS_INTERACTIVE_EXAMPLE_CONTENT),
        id: `new_desmos_block_${suffix}`,
        type: 'desmos_interactive',
        title: 'New Desmos Interaction',
        instructions_html: '<p>Type <strong>y=x</strong> into Desmos.</p>',
        caption_html: '<p>Check your setup before continuing.</p>',
        validation: {
          mode: 'equivalent',
          expected: ['y=x'],
          test_values: [-2, 0, 2],
          tolerance: 0.000001,
          state_rules: {
            min_expressions: 1,
            max_expressions: 1,
            require_visible_only: true,
          },
        },
        feedback: {
          success_message_html: '<p>Nice.</p>',
          retry_message_html: '<p>Check your expression and try again.</p>',
        },
        progression: {
          require_success: true,
        },
      },
    };
  }

  return {
    id: `new_text_block_${suffix}`,
    block_type: 'text',
    sort_order: index,
    content: {
      id: `new_text_block_${suffix}`,
      html: '<p>New text block</p>',
    },
  };
}

export function duplicateBlock(block, index = 0) {
  const copy = structuredClone(block || {});
  const suffix = `${Date.now()}_${index}`;
  copy.id = `${copy.id || copy.block_type || 'block'}_copy_${suffix}`;
  copy.sort_order = index;
  if (copy.content && typeof copy.content === 'object') {
    if (copy.content.id) copy.content.id = `${copy.content.id}_copy_${suffix}`;
  }
  return copy;
}

export function parseJsonDraft(text) {
  try {
    const parsed = JSON.parse(text);
    return { parsed, error: null };
  } catch (err) {
    return { parsed: null, error: err.message };
  }
}

export function updateBlockContentFromDraft(blocks, selectedIndex, text) {
  const { parsed, error } = parseJsonDraft(text);
  if (error) return { blocks, error };
  const next = [...blocks];
  next[selectedIndex] = { ...next[selectedIndex], content: parsed };
  return { blocks: next, error: null };
}

export function getBlockLabel(block) {
  if (!block) return 'Unknown block';
  if (block.block_type === 'text') return stripHtml(block.content?.html || 'Text block');
  if (block.block_type === 'check') return block.content?.prompt || 'Knowledge check';
  if (block.block_type === 'desmos_interactive') return block.content?.title || 'Desmos interactive';
  if (block.block_type === 'video') return block.content?.caption || block.content?.url || 'Video';
  return block.content?.id || block.block_type;
}

function stripHtml(input) {
  return String(input || '').replace(/<[^>]+>/g, '').slice(0, 50) || 'Text block';
}
