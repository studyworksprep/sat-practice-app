import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStarterBlock,
  duplicateBlock,
  parseJsonDraft,
  recomputeSortOrders,
  updateBlockContentFromDraft,
} from './editor-utils.mjs';

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
