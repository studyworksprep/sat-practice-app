import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBlockIndexMap,
  resolveAnswerNavigation,
  resolveContinueNavigation,
  resolveResumeIndex,
} from './runtime-navigation.mjs';

function sampleBlocks() {
  return [
    { id: 'intro', block_type: 'text', content: {} },
    { id: 'check-1', block_type: 'check', content: { on_correct_block_id: 'branch-correct', on_incorrect_block_id: 'branch-incorrect', rejoin_at_block_id: 'rejoin' } },
    { id: 'branch-correct', block_type: 'text', content: { rejoin_at_block_id: 'rejoin' } },
    { id: 'branch-incorrect', block_type: 'text', content: { rejoin_at_block_id: 'rejoin' } },
    { id: 'rejoin', block_type: 'text', content: {} },
    { id: 'outro', block_type: 'text', content: {} },
  ];
}

test('correct answer routes to on_correct_block_id', () => {
  const blocks = sampleBlocks();
  const blockIndexById = buildBlockIndexMap(blocks);
  const result = resolveAnswerNavigation({
    block: blocks[1],
    isCorrect: true,
    currentIndex: 1,
    totalBlocks: blocks.length,
    blockIndexById,
  });

  assert.equal(result.nextIndex, 2);
  assert.equal(result.targetResolved, true);
  assert.deepEqual(result.activeBranchState, {
    sourceBlockId: 'check-1',
    chosenBlockId: 'branch-correct',
    rejoinBlockId: 'rejoin',
  });
});

test('incorrect answer routes to on_incorrect_block_id', () => {
  const blocks = sampleBlocks();
  const blockIndexById = buildBlockIndexMap(blocks);
  const result = resolveAnswerNavigation({
    block: blocks[1],
    isCorrect: false,
    currentIndex: 1,
    totalBlocks: blocks.length,
    blockIndexById,
  });

  assert.equal(result.nextIndex, 3);
  assert.equal(result.targetResolved, true);
  assert.equal(result.activeBranchState.chosenBlockId, 'branch-incorrect');
});

test('branch feedback block rejoin routing takes learner to rejoin_at_block_id', () => {
  const blocks = sampleBlocks();
  const blockIndexById = buildBlockIndexMap(blocks);
  const result = resolveContinueNavigation({
    blocks,
    currentIndex: 2,
    activeBranchState: {
      sourceBlockId: 'check-1',
      chosenBlockId: 'branch-correct',
      rejoinBlockId: 'rejoin',
    },
    blockIndexById,
  });

  assert.equal(result.nextIndex, 4);
  assert.deepEqual(result.activeBranchState, {
    sourceBlockId: 'check-1',
    chosenBlockId: 'branch-correct',
    rejoinBlockId: 'rejoin',
  });
});

test('missing branch target falls back to linear progression', () => {
  const blocks = sampleBlocks();
  const blockIndexById = buildBlockIndexMap(blocks);
  const blockWithMissingTarget = {
    ...blocks[1],
    content: { ...blocks[1].content, on_correct_block_id: 'does-not-exist' },
  };

  const result = resolveAnswerNavigation({
    block: blockWithMissingTarget,
    isCorrect: true,
    currentIndex: 1,
    totalBlocks: blocks.length,
    blockIndexById,
  });

  assert.equal(result.nextIndex, 2);
  assert.equal(result.targetResolved, false);
  assert.equal(result.activeBranchState, null);
});

test('branch targets resolve by content.id when block.id differs (imported lessons)', () => {
  // After import + save the top-level id is a fresh DB uuid, but branch
  // fields still reference the stable content ids preserved in content.
  const blocks = [
    { id: 'uuid-0', block_type: 'check', content: { id: 'q', on_correct_block_id: 'fb_ok', on_incorrect_block_id: 'fb_no', rejoin_at_block_id: 'rj' } },
    { id: 'uuid-1', block_type: 'text', content: { id: 'fb_ok', rejoin_at_block_id: 'rj' } },
    { id: 'uuid-2', block_type: 'text', content: { id: 'fb_no', rejoin_at_block_id: 'rj' } },
    { id: 'uuid-3', block_type: 'text', content: { id: 'rj' } },
    { id: 'uuid-4', block_type: 'text', content: { id: 'end' } },
  ];
  const blockIndexById = buildBlockIndexMap(blocks);

  const correct = resolveAnswerNavigation({ block: blocks[0], isCorrect: true, currentIndex: 0, totalBlocks: blocks.length, blockIndexById });
  assert.equal(correct.nextIndex, 1);
  assert.equal(correct.targetResolved, true);

  // Continue from the correct-feedback block rejoins, skipping the
  // incorrect-feedback block.
  const afterCorrect = resolveContinueNavigation({ blocks, currentIndex: 1, activeBranchState: correct.activeBranchState, blockIndexById });
  assert.equal(afterCorrect.nextIndex, 3);

  const incorrect = resolveAnswerNavigation({ block: blocks[0], isCorrect: false, currentIndex: 0, totalBlocks: blocks.length, blockIndexById });
  assert.equal(incorrect.nextIndex, 2);
  const afterIncorrect = resolveContinueNavigation({ blocks, currentIndex: 2, activeBranchState: incorrect.activeBranchState, blockIndexById });
  assert.equal(afterIncorrect.nextIndex, 3);
});

test('workflow metadata remains compatible with navigation decisions', () => {
  const blocks = [
    { id: 'wf-1', block_type: 'desmos_interactive', content: { workflow_id: 'graph-flow', step_index: 1, total_steps: 2, on_correct_block_id: 'wf-2' } },
    { id: 'wf-2', block_type: 'desmos_interactive', content: { workflow_id: 'graph-flow', step_index: 2, total_steps: 2 } },
  ];
  const blockIndexById = buildBlockIndexMap(blocks);
  const result = resolveAnswerNavigation({
    block: blocks[0],
    isCorrect: true,
    currentIndex: 0,
    totalBlocks: blocks.length,
    blockIndexById,
  });

  assert.equal(result.nextIndex, 1);
  assert.equal(result.activeBranchState.chosenBlockId, 'wf-2');
});

// ── resolveResumeIndex ──────────────────────────────────────────────

function fourBlocks() {
  return [
    { id: 'a', block_type: 'text', content: {} },
    { id: 'b', block_type: 'check', content: {} },
    { id: 'c', block_type: 'text', content: {} },
    { id: 'd', block_type: 'lesson_complete', content: {} },
  ];
}

test('resume starts at the top for a first visit', () => {
  assert.equal(resolveResumeIndex({ blocks: fourBlocks(), completedBlockIds: [] }), 0);
  assert.equal(resolveResumeIndex({ blocks: fourBlocks() }), 0);
  assert.equal(resolveResumeIndex(), 0);
});

test('resume lands one past the furthest block reached', () => {
  assert.equal(
    resolveResumeIndex({ blocks: fourBlocks(), completedBlockIds: ['a'] }),
    1,
  );
  assert.equal(
    resolveResumeIndex({ blocks: fourBlocks(), completedBlockIds: ['a', 'b'] }),
    2,
  );
});

// A learner who branched past a remediation detour leaves gaps behind
// them; resuming must not drag them back into the skipped slides.
test('resume ignores gaps left by a branch and uses the furthest block', () => {
  assert.equal(
    resolveResumeIndex({ blocks: fourBlocks(), completedBlockIds: ['a', 'c'] }),
    3,
  );
});

test('resume never runs past the last block', () => {
  assert.equal(
    resolveResumeIndex({
      blocks: fourBlocks(),
      completedBlockIds: ['a', 'b', 'c', 'd'],
    }),
    3,
  );
});

test('a finished lesson reopens at the top for review', () => {
  assert.equal(
    resolveResumeIndex({
      blocks: fourBlocks(),
      completedBlockIds: ['a', 'b', 'c'],
      isComplete: true,
    }),
    0,
  );
});

test('resume tolerates stale ids from blocks that no longer exist', () => {
  assert.equal(
    resolveResumeIndex({ blocks: fourBlocks(), completedBlockIds: ['deleted'] }),
    0,
  );
});

test('resume compares ids as strings', () => {
  const blocks = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(resolveResumeIndex({ blocks, completedBlockIds: ['1'] }), 1);
});
