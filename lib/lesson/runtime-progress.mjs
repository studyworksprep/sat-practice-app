const PASSIVE_BLOCK_TYPES = new Set(['text', 'video', 'question_link']);

// Passive blocks have no submit action of their own. Advancing is the
// learner's explicit signal that the block is complete; dwell timers and
// media/link clicks may still record it earlier, but Continue is the
// authoritative fallback.
export function shouldCompleteOnContinue(block) {
  return PASSIVE_BLOCK_TYPES.has(block?.block_type);
}

// Required Desmos activities complete only after a successful submission.
// Optional activities complete after any submitted result.
export function shouldCompleteDesmosResult(block, isCorrect) {
  const requireSuccess = Boolean(block?.content?.progression?.require_success);
  return Boolean(isCorrect) || !requireSuccess;
}

// Fold one submitted attempt into a lesson_progress.check_answers entry.
// Entries carry the full attempt history:
//   { selected, correct, first_try_correct, attempts: [{ selected, at }] }
// where `selected`/`correct` describe the latest attempt. Both the
// slideshow's local state and the server action run this same reducer
// against their own copy of the entry, so the persisted row and the
// in-memory row evolve identically.
//
// Legacy entries ({ selected, correct } with no attempts array) predate
// attempt tracking: they recorded only the finalizing submission. When
// one receives a new attempt (re-checking a Desmos activity), the legacy
// submission is kept as an attempt with an unknown timestamp so the
// count stays honest, and its recorded correctness stands in for the
// unknowable first try.
export function applyCheckAttempt(previousEntry, { selected = null, correct, at = null, type } = {}) {
  const priorAttempts = Array.isArray(previousEntry?.attempts)
    ? previousEntry.attempts
    : previousEntry
      ? [{ selected: previousEntry.selected ?? null, at: null }]
      : [];
  const attempts = [...priorAttempts, { selected, at }];
  const firstTryCorrect =
    typeof previousEntry?.first_try_correct === 'boolean'
      ? previousEntry.first_try_correct
      : previousEntry
        ? Boolean(previousEntry.correct)
        : Boolean(correct);
  const entry = {
    selected,
    correct: Boolean(correct),
    first_try_correct: firstTryCorrect,
    attempts,
  };
  const entryType = type ?? previousEntry?.type;
  if (entryType) entry.type = entryType;
  return entry;
}

// How many submissions an entry records. A legacy entry without an
// attempts array recorded exactly its one finalizing submission.
export function checkAttemptCount(entry) {
  if (!entry) return 0;
  return Array.isArray(entry.attempts) ? entry.attempts.length : 1;
}

// Whether an entry's first submission was correct. Legacy entries fall
// back to their final correctness — exact for one-shot checks (one
// submission total); a best-effort stand-in for pre-tracking retry and
// Desmos entries, whose earlier attempts were never persisted.
export function checkFirstTryCorrect(entry) {
  if (!entry) return false;
  return typeof entry.first_try_correct === 'boolean'
    ? entry.first_try_correct
    : Boolean(entry.correct);
}

// Escalation policy (plan 1.4; decided 2026-08-22): after this many
// wrong tries on a retry check, the runtime reveals the worked solution
// (content.solution, falling back to content.explanation), records the
// block as struggled, and unlocks Continue — a stuck student is never
// trapped in the retry loop.
export const DEFAULT_MAX_ATTEMPTS_BEFORE_REVEAL = 2;

export function maxAttemptsBeforeReveal(content) {
  const value = content?.max_attempts_before_reveal;
  return Number.isInteger(value) && value >= 1
    ? value
    : DEFAULT_MAX_ATTEMPTS_BEFORE_REVEAL;
}

// Wrong tries recorded so far. In retry mode any correct answer
// finalizes the block, so a not-yet-correct entry's attempts are all
// misses; a finalized-correct entry contributes none.
export function checkMissCount(entry) {
  if (!entry || entry.correct) return 0;
  return checkAttemptCount(entry);
}

// How a check block restores from a persisted entry on reload. A retry
// check finalizes (reveals the answer and locks) either on a correct
// answer or when the escalation policy has already revealed the
// solution; a persisted wrong attempt below the reveal threshold
// restores live — the learner keeps trying and the Continue gate holds.
// One-shot checks finalize on any submission.
export function resolveCheckRestoreState(
  previousEntry,
  allowRetry,
  maxAttempts = DEFAULT_MAX_ATTEMPTS_BEFORE_REVEAL,
) {
  if (!previousEntry) return { selected: null, revealed: false };
  const revealed = allowRetry
    ? Boolean(previousEntry.correct) || checkMissCount(previousEntry) >= maxAttempts
    : true;
  return {
    selected: previousEntry.selected ?? null,
    revealed,
  };
}

const ANSWERABLE_BLOCK_TYPES = new Set(['check', 'desmos_interactive']);

// The completion banner's tally: first-try accuracy over the checks the
// learner actually submitted, plus which blocks showed friction — 3+
// tries, or a final answer that stayed wrong (a missed one-shot, or a
// retry check that ended in the solution reveal). Counting only
// submitted blocks keeps the denominator honest when a lesson is
// finished without every optional check.
export function summarizeCheckAttempts(blocks, checkAnswers) {
  const perBlock = [];
  (blocks || []).forEach((block, index) => {
    if (!ANSWERABLE_BLOCK_TYPES.has(block?.block_type)) return;
    const entry = (checkAnswers || {})[block.id];
    if (!entry) return;
    perBlock.push({
      blockId: block.id,
      stepNumber: index + 1,
      blockType: block.block_type,
      attempts: checkAttemptCount(entry),
      firstTryCorrect: checkFirstTryCorrect(entry),
      finalCorrect: Boolean(entry.correct),
    });
  });
  return {
    perBlock,
    answered: perBlock.length,
    firstTryCorrect: perBlock.filter((row) => row.firstTryCorrect).length,
    struggledBlocks: perBlock.filter((row) => row.attempts >= 3 || !row.finalCorrect),
  };
}

// A forward branch jump resolves the blocks between the source and target:
// they belong to the path the learner did not take and must not leave holes
// in progress or lock completion after the chosen path rejoins.
export function skippedBlockIdsForForwardJump(blocks, fromIndex, nextIndex) {
  if (!Array.isArray(blocks) || nextIndex <= fromIndex + 1) return [];
  return blocks
    .slice(fromIndex + 1, nextIndex)
    .map((block) => block?.id)
    .filter(Boolean);
}
