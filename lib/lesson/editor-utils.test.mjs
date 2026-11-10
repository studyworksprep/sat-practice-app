import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStarterBlock,
  duplicateBlock,
  indexSharedPrompts,
  parseJsonDraft,
  recomputeSortOrders,
  removeBlockAt,
  setSharedPromptOnBlocks,
  sharedPromptIdFor,
  updateBlockContentFromDraft,
} from './editor-utils.mjs';

test('shared prompt selection and duplication retain one source even if the source slide is deleted', () => {
  const slides = ['read', 'check', 'independent'].map((id) => ({ id, block_type: 'text', content: { html: id } }));
  const prompt = { id: 'table', title: 'Shirt table', html: '<table><tr><td>20</td></tr></table>' };
  const attached = setSharedPromptOnBlocks(slides, prompt, new Set(['read', 'check']));
  const copy = duplicateBlock(attached[0]);
  const remaining = removeBlockAt([...attached, copy], 0);
  const lookup = indexSharedPrompts(remaining);

  assert.equal(lookup.get(sharedPromptIdFor(remaining[0]))?.html, prompt.html);
  assert.equal(lookup.get(sharedPromptIdFor(remaining[1])), undefined);
  assert.equal(lookup.get(sharedPromptIdFor(copy))?.html, prompt.html);
  assert.equal(remaining.filter(({ content }) => typeof content.shared_prompt === 'object').length, 1);

  const moved = setSharedPromptOnBlocks(remaining, { ...prompt, html: '<p>Updated</p>' }, new Set(['independent']));
  assert.deepEqual(moved.map(sharedPromptIdFor), [null, 'table', null]);
  assert.equal(indexSharedPrompts(moved).get('table')?.html, '<p>Updated</p>');
});

test('recomputeSortOrders assigns sequential sort_order', () => {
  const sorted = recomputeSortOrders([{ id: 'a' }, { id: 'b' }]);
  assert.equal(sorted[0].sort_order, 0);
  assert.equal(sorted[1].sort_order, 1);
});

test('duplicateBlock generates new ids for block and content', () => {
  const copy = duplicateBlock({ id: 'block_1', block_type: 'text', content: { id: 'content_1' } }, 1);
  assert.notEqual(copy.id, 'block_1');
  assert.notEqual(copy.content.id, 'content_1');
});

test('duplicateBlock drops canonical revision provenance', () => {
  const copy = duplicateBlock({
    id: 'revision-row',
    source_block_id: 'canonical-row',
    block_type: 'text',
    content: { id: 'semantic-id', html: '<p>Hello</p>' },
  }, 1);
  assert.equal(copy.source_block_id, undefined);
});

test('parseJsonDraft reports parse errors', () => {
  const bad = parseJsonDraft('{"x": }');
  assert.equal(Boolean(bad.error), true);
  const good = parseJsonDraft('{"x":1}');
  assert.equal(good.parsed.x, 1);
});

test('updateBlockContentFromDraft keeps original blocks on parse error', () => {
  const original = [{ block_type: 'text', content: { html: '<p>a</p>' } }];
  const failed = updateBlockContentFromDraft(original, 0, '{"html":');
  assert.equal(failed.error !== null, true);
  assert.equal(failed.blocks, original);

  const passed = updateBlockContentFromDraft(original, 0, '{"html":"<p>b</p>"}');
  assert.equal(passed.error, null);
  assert.equal(passed.blocks[0].content.html, '<p>b</p>');
});

test('createStarterBlock includes required desmos starter fields', () => {
  const block = createStarterBlock('desmos_interactive', 0);
  assert.equal(block.block_type, 'desmos_interactive');
  assert.equal(block.content.validation.mode, 'equivalent');
  assert.equal(block.content.progression.require_success, true);
});

test('createStarterBlock produces a video block with url/caption fields', () => {
  const block = createStarterBlock('video', 0);
  assert.equal(block.block_type, 'video');
  assert.equal(block.content.url, '');
  assert.equal(block.content.caption, '');
  assert.equal(block.content.id, block.id);
});

test('createStarterBlock produces a question_link block with a question_id field', () => {
  const block = createStarterBlock('question_link', 0);
  assert.equal(block.block_type, 'question_link');
  assert.equal(block.content.question_id, '');
  assert.equal(block.content.id, block.id);
});

test('createStarterBlock defaults unknown types to text', () => {
  const block = createStarterBlock('something_else', 0);
  assert.equal(block.block_type, 'text');
});
