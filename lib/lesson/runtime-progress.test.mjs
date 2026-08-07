import test from 'node:test';
import assert from 'node:assert/strict';

import {
  skippedBlockIdsForForwardJump,
  shouldCompleteDesmosResult,
  shouldCompleteOnContinue,
} from './runtime-progress.mjs';

test('Continue completes passive lesson blocks', () => {
  for (const block_type of ['text', 'video', 'question_link']) {
    assert.equal(shouldCompleteOnContinue({ block_type }), true, block_type);
  }
});

test('Continue does not bypass explicit completion controls', () => {
  for (const block_type of ['check', 'desmos_interactive', 'lesson_complete']) {
    assert.equal(shouldCompleteOnContinue({ block_type }), false, block_type);
  }
});

test('required Desmos activities complete only on success', () => {
  const block = {
    block_type: 'desmos_interactive',
    content: { progression: { require_success: true } },
  };
  assert.equal(shouldCompleteDesmosResult(block, false), false);
  assert.equal(shouldCompleteDesmosResult(block, true), true);
});

test('optional Desmos activities complete after any submitted result', () => {
  const block = {
    block_type: 'desmos_interactive',
    content: { progression: { require_success: false } },
  };
  assert.equal(shouldCompleteDesmosResult(block, false), true);
  assert.equal(shouldCompleteDesmosResult(block, true), true);
});

test('forward branch jumps resolve only the skipped block ids', () => {
  const blocks = [
    { id: 'question' },
    { id: 'correct-feedback' },
    { id: 'incorrect-feedback' },
    { id: 'rejoin' },
  ];
  assert.deepEqual(
    skippedBlockIdsForForwardJump(blocks, 0, 2),
    ['correct-feedback'],
  );
  assert.deepEqual(
    skippedBlockIdsForForwardJump(blocks, 1, 3),
    ['incorrect-feedback'],
  );
});

test('linear and backward navigation do not resolve extra blocks', () => {
  const blocks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(skippedBlockIdsForForwardJump(blocks, 0, 1), []);
  assert.deepEqual(skippedBlockIdsForForwardJump(blocks, 2, 1), []);
});
