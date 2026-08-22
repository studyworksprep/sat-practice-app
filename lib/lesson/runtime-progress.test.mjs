import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCheckAttempt,
  checkAttemptCount,
  checkFirstTryCorrect,
  checkMissCount,
  DEFAULT_MAX_ATTEMPTS_BEFORE_REVEAL,
  maxAttemptsBeforeReveal,
  resolveCheckRestoreState,
  skippedBlockIdsForForwardJump,
  shouldCompleteDesmosResult,
  shouldCompleteOnContinue,
  summarizeCheckAttempts,
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

// ─── applyCheckAttempt ────────────────────────────────────────────

test('a first correct attempt records first_try_correct', () => {
  const entry = applyCheckAttempt(undefined, { selected: 2, correct: true, at: 't1' });
  assert.deepEqual(entry, {
    selected: 2,
    correct: true,
    first_try_correct: true,
    attempts: [{ selected: 2, at: 't1' }],
  });
});

test('a wrong retry attempt accumulates without erasing history', () => {
  const first = applyCheckAttempt(undefined, { selected: 1, correct: false, at: 't1' });
  const second = applyCheckAttempt(first, { selected: 3, correct: false, at: 't2' });
  const third = applyCheckAttempt(second, { selected: 0, correct: true, at: 't3' });
  assert.equal(third.correct, true);
  assert.equal(third.first_try_correct, false);
  assert.deepEqual(third.attempts, [
    { selected: 1, at: 't1' },
    { selected: 3, at: 't2' },
    { selected: 0, at: 't3' },
  ]);
});

test('desmos attempts keep their type tag across the reducer', () => {
  const first = applyCheckAttempt(undefined, {
    selected: null,
    correct: false,
    at: 't1',
    type: 'desmos_interactive',
  });
  const second = applyCheckAttempt(first, { selected: null, correct: true, at: 't2' });
  assert.equal(second.type, 'desmos_interactive');
  assert.equal(second.attempts.length, 2);
});

test('a legacy entry counts as one attempt when a new attempt arrives', () => {
  const legacy = { selected: 1, correct: false, type: 'desmos_interactive' };
  const next = applyCheckAttempt(legacy, { selected: null, correct: true, at: 't2' });
  assert.equal(next.attempts.length, 2);
  assert.deepEqual(next.attempts[0], { selected: 1, at: null });
  // The legacy final correctness stands in for the unknowable first try.
  assert.equal(next.first_try_correct, false);
});

// ─── attempt counting / first-try readers ─────────────────────────

test('attempt counts tolerate legacy and missing entries', () => {
  assert.equal(checkAttemptCount(undefined), 0);
  assert.equal(checkAttemptCount({ selected: 1, correct: true }), 1);
  assert.equal(
    checkAttemptCount({ correct: true, attempts: [{}, {}, {}] }),
    3,
  );
});

test('first-try reads fall back to legacy final correctness', () => {
  assert.equal(checkFirstTryCorrect(undefined), false);
  assert.equal(checkFirstTryCorrect({ selected: 0, correct: true }), true);
  assert.equal(checkFirstTryCorrect({ correct: true, first_try_correct: false }), false);
});

// ─── restore on reload ────────────────────────────────────────────

test('a persisted wrong retry attempt restores live so the gate holds', () => {
  const entry = applyCheckAttempt(undefined, { selected: 1, correct: false, at: 't1' });
  assert.deepEqual(resolveCheckRestoreState(entry, true), {
    selected: 1,
    revealed: false,
  });
});

test('a correct retry answer and any one-shot answer restore revealed', () => {
  const correct = applyCheckAttempt(undefined, { selected: 2, correct: true, at: 't1' });
  assert.deepEqual(resolveCheckRestoreState(correct, true), {
    selected: 2,
    revealed: true,
  });
  const oneShotWrong = applyCheckAttempt(undefined, { selected: 0, correct: false, at: 't1' });
  assert.deepEqual(resolveCheckRestoreState(oneShotWrong, false), {
    selected: 0,
    revealed: true,
  });
});

test('an unanswered check restores untouched', () => {
  assert.deepEqual(resolveCheckRestoreState(undefined, true), {
    selected: null,
    revealed: false,
  });
});

// ─── escalation policy ────────────────────────────────────────────

test('the reveal threshold defaults to 2 and honors a content override', () => {
  assert.equal(DEFAULT_MAX_ATTEMPTS_BEFORE_REVEAL, 2);
  assert.equal(maxAttemptsBeforeReveal(undefined), 2);
  assert.equal(maxAttemptsBeforeReveal({}), 2);
  assert.equal(maxAttemptsBeforeReveal({ max_attempts_before_reveal: 3 }), 3);
  assert.equal(maxAttemptsBeforeReveal({ max_attempts_before_reveal: 0 }), 2);
  assert.equal(maxAttemptsBeforeReveal({ max_attempts_before_reveal: '3' }), 2);
});

test('miss counts read the persisted attempt history', () => {
  assert.equal(checkMissCount(undefined), 0);
  const oneMiss = applyCheckAttempt(undefined, { selected: 1, correct: false, at: 't1' });
  assert.equal(checkMissCount(oneMiss), 1);
  const twoMisses = applyCheckAttempt(oneMiss, { selected: 2, correct: false, at: 't2' });
  assert.equal(checkMissCount(twoMisses), 2);
  // A finalized-correct entry contributes no further misses.
  const finalized = applyCheckAttempt(twoMisses, { selected: 0, correct: true, at: 't3' });
  assert.equal(checkMissCount(finalized), 0);
});

test('a reload cannot reset the escalation: 2 misses restore revealed', () => {
  const oneMiss = applyCheckAttempt(undefined, { selected: 1, correct: false, at: 't1' });
  const twoMisses = applyCheckAttempt(oneMiss, { selected: 2, correct: false, at: 't2' });
  // Below the threshold the check restores live; at it, revealed.
  assert.equal(resolveCheckRestoreState(oneMiss, true).revealed, false);
  assert.deepEqual(resolveCheckRestoreState(twoMisses, true), {
    selected: 2,
    revealed: true,
  });
  // A raised threshold keeps the check live at 2 misses.
  assert.equal(resolveCheckRestoreState(twoMisses, true, 3).revealed, false);
});

test('the summary lists revealed and missed-one-shot blocks as struggled', () => {
  const blocks = [
    { id: 'revealed', block_type: 'check' },
    { id: 'oneshot_missed', block_type: 'check' },
    { id: 'fine', block_type: 'check' },
  ];
  let revealedEntry = applyCheckAttempt(undefined, { selected: 1, correct: false, at: 't1' });
  revealedEntry = applyCheckAttempt(revealedEntry, { selected: 2, correct: false, at: 't2' });
  const summary = summarizeCheckAttempts(blocks, {
    revealed: revealedEntry,
    oneshot_missed: applyCheckAttempt(undefined, { selected: 3, correct: false, at: 't1' }),
    fine: applyCheckAttempt(undefined, { selected: 0, correct: true, at: 't1' }),
  });
  assert.deepEqual(
    summary.struggledBlocks.map((row) => row.blockId),
    ['revealed', 'oneshot_missed'],
  );
});

// ─── completion summary ───────────────────────────────────────────

test('the summary reports first-try accuracy and 3+-try blocks', () => {
  const blocks = [
    { id: 'intro', block_type: 'text' },
    { id: 'c1', block_type: 'check' },
    { id: 'c2', block_type: 'check' },
    { id: 'd1', block_type: 'desmos_interactive' },
    { id: 'c3', block_type: 'check' },
    { id: 'done', block_type: 'lesson_complete' },
  ];
  let c2 = applyCheckAttempt(undefined, { selected: 0, correct: false, at: 't1' });
  c2 = applyCheckAttempt(c2, { selected: 1, correct: false, at: 't2' });
  c2 = applyCheckAttempt(c2, { selected: 2, correct: true, at: 't3' });
  const checkAnswers = {
    c1: applyCheckAttempt(undefined, { selected: 2, correct: true, at: 't1' }),
    c2,
    d1: applyCheckAttempt(undefined, {
      selected: null, correct: true, at: 't1', type: 'desmos_interactive',
    }),
    // c3 never submitted: stays out of the denominator.
  };
  const summary = summarizeCheckAttempts(blocks, checkAnswers);
  assert.equal(summary.answered, 3);
  assert.equal(summary.firstTryCorrect, 2);
  assert.deepEqual(
    summary.struggledBlocks.map((row) => row.blockId),
    ['c2'],
  );
  assert.deepEqual(summary.perBlock.map((row) => row.stepNumber), [2, 3, 4]);
  assert.deepEqual(
    summary.perBlock.map((row) => row.attempts),
    [1, 3, 1],
  );
});

test('legacy one-shot entries count as first-try in the summary', () => {
  const blocks = [{ id: 'c1', block_type: 'check' }];
  const summary = summarizeCheckAttempts(blocks, {
    c1: { selected: 1, correct: true },
  });
  assert.equal(summary.answered, 1);
  assert.equal(summary.firstTryCorrect, 1);
  assert.equal(summary.perBlock[0].attempts, 1);
});
