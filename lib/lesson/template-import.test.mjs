import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyImportedBlocks,
  compileLessonTemplateSpec,
  parseLessonTemplateSpecText,
} from './template-import.mjs';

test('valid spec compiles into blocks', () => {
  const result = compileLessonTemplateSpec({
    title: 't',
    description: 'd',
    blocks: [
      { kind: 'text', id: 'intro', html: '<p>Hi</p>' },
      { kind: 'graph_comparison_workflow', id: 'graph1', original_expression: 'y=x', candidate_expression: 'y=x' },
      { kind: 'raw_block', block_type: 'text', content: { html: '<p>raw</p>' } },
    ],
  });
  assert.equal(result.blocks.length, 9);
  assert.equal(result.issues.some((i) => i.severity === 'error'), false);
});

test('unknown kind returns error', () => {
  const result = compileLessonTemplateSpec({ blocks: [{ kind: 'unknown' }] });
  assert.ok(result.issues.some((i) => i.severity === 'error' && i.path === 'blocks[0].kind'));
});

test('missing required fields return errors', () => {
  const result = compileLessonTemplateSpec({ blocks: [{ kind: 'desmos_enter_expression', id: 'd1' }] });
  assert.ok(result.issues.some((i) => i.path === 'blocks[0].title'));
  assert.ok(result.issues.some((i) => i.path === 'blocks[0].instructions_html'));
  assert.ok(result.issues.some((i) => i.path === 'blocks[0].expression'));
});

test('branching_question validates correct_choice_id', () => {
  const result = compileLessonTemplateSpec({
    blocks: [{
      kind: 'branching_question',
      id: 'b1',
      question_html: '<p>Q</p>',
      choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      correct_choice_id: 'c',
    }],
  });
  assert.ok(result.issues.some((i) => i.path === 'blocks[0].correct_choice_id' && i.severity === 'error'));
});

test('branching_question validates choice shape', () => {
  const result = compileLessonTemplateSpec({
    blocks: [{
      kind: 'branching_question',
      id: 'b1',
      question_html: '<p>Q</p>',
      choices: [{ id: 'a' }, null],
      correct_choice_id: 'a',
    }],
  });
  assert.ok(result.issues.some((i) => i.path === 'blocks[0].choices[0].text' && i.severity === 'error'));
  assert.ok(result.issues.some((i) => i.path === 'blocks[0].choices[1]' && i.severity === 'error'));
});

test('graph_comparison_workflow expands into multiple blocks', () => {
  const result = compileLessonTemplateSpec({
    blocks: [{ kind: 'graph_comparison_workflow', id: 'gw1', original_expression: 'y=x', candidate_expression: 'y=x' }],
  });
  assert.equal(result.blocks.length, 7);
});

test('slider_workflow expands into multiple blocks and requires expression', () => {
  const missingExpression = compileLessonTemplateSpec({
    blocks: [{ kind: 'slider_workflow', id: 'sw1' }],
  });
  assert.ok(missingExpression.issues.some((i) => i.path === 'blocks[0].expression' && i.severity === 'error'));

  const result = compileLessonTemplateSpec({
    blocks: [{ kind: 'slider_workflow', id: 'sw2', expression: '6X^2Y^2(X^6+2)' }],
  });
  assert.equal(result.blocks.length, 4);
});

test('raw_block passes through block_type and content', () => {
  const rawContent = { id: 'raw_1', html: '<p>Raw</p>' };
  const result = compileLessonTemplateSpec({
    blocks: [{ kind: 'raw_block', id: 'r1', block_type: 'text', content: rawContent }],
  });
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].block_type, 'text');
  assert.equal(result.blocks[0].content.html, '<p>Raw</p>');
});

test('duplicate ids are resolved and branch references remain valid', () => {
  const result = compileLessonTemplateSpec({
    blocks: [
      { kind: 'branching_question', id: 'dup', question_html: '<p>Q</p>', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct_choice_id: 'b' },
      { kind: 'branching_question', id: 'dup', question_html: '<p>Q2</p>', choices: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct_choice_id: 'b' },
    ],
  }, { existingBlockIds: ['dup_question'] });

  const ids = result.blocks.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const block of result.blocks) {
    const c = block.content || {};
    for (const key of ['on_correct_block_id', 'on_incorrect_block_id', 'rejoin_at_block_id']) {
      if (c[key]) assert.ok(ids.includes(c[key]));
    }
  }
});

test('content.id collisions are suffixed deterministically', () => {
  const result = compileLessonTemplateSpec({
    blocks: [
      { kind: 'text', id: 'intro', html: '<p>A</p>' },
      { kind: 'text', id: 'intro', html: '<p>B</p>' },
    ],
  }, { existingContentIds: ['intro'] });

  const contentIds = result.blocks.map((block) => block.content?.id).filter(Boolean);
  assert.equal(new Set(contentIds).size, contentIds.length);
  assert.ok(contentIds.some((id) => String(id).startsWith('intro_')));
});

test('applyImportedBlocks supports append, insert, replace', () => {
  const existing = [{ id: 'a', sort_order: 0 }, { id: 'b', sort_order: 1 }];
  const imported = [{ id: 'x' }];
  assert.deepEqual(applyImportedBlocks(existing, imported, 'append').map((b) => b.id), ['a', 'b', 'x']);
  assert.deepEqual(applyImportedBlocks(existing, imported, 'insert_after_selected', 0).map((b) => b.id), ['a', 'x', 'b']);
  assert.deepEqual(applyImportedBlocks(existing, imported, 'replace_all').map((b) => b.id), ['x']);
});

test('parseLessonTemplateSpecText handles invalid JSON', () => {
  const bad = parseLessonTemplateSpecText('{"a":');
  assert.equal(Boolean(bad.error), true);
  const good = parseLessonTemplateSpecText('{"blocks":[]}');
  assert.equal(Array.isArray(good.spec.blocks), true);
});
