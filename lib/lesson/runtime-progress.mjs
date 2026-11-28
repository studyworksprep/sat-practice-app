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

// Keep the last result for the lesson runner and a chronological history for
// review. Store the authored snapshot only when its version changes.
/**
 * @param {any} previousEntry
 * @param {{selected?: string|number|null, correct?:boolean, at?:string|null, type?:string,
 * id?:string, question?:import('./check-review.mjs').ReviewQuestion, version?:string, expressions?:string[], revealed?:boolean}} submission
 */
export function applyCheckAttempt(previousEntry, {
  selected = null, correct, at = null, type, id, question, version, expressions, revealed,
} = {}) {
  const prior = Array.isArray(previousEntry?.attempts) ? previousEntry.attempts
    : previousEntry ? [{ selected: previousEntry.selected ?? null, correct: previousEntry.correct, at: null }] : [];
  if (id && prior.some(a => a.id === id)) return previousEntry;
  const attempt = { selected, correct: Boolean(correct), at };
  if (id) attempt.id = id;
  if (version && previousEntry?.version !== version) attempt.question = question;
  if (expressions) attempt.expressions = expressions;
  if (revealed) attempt.revealed = true;
  const entry = {
    selected, correct: Boolean(correct),
    first_try_correct: previousEntry ? checkFirstTryCorrect(previousEntry) : Boolean(correct),
    attempts: [...prior, attempt],
  };
  if (type ?? previousEntry?.type) entry.type = type ?? previousEntry.type;
  if (version ?? previousEntry?.version) entry.version = version ?? previousEntry.version;
  return entry;
}

// How many submissions an entry records. A legacy entry without an
// attempts array recorded exactly its one finalizing submission.
export function checkAttemptCount(entry) {
  if (!entry) return 0;
  return Array.isArray(entry.attempts) ? entry.attempts.length : 1;
}

// Older records kept only the final submission. The original reducer
// represented a legacy submission carried into tracked history with at:null.
export function checkFirstTryCorrect(entry) {
  if (typeof entry?.first_try_correct !== 'boolean') return null;
  if (entry.attempts?.length > 1 && entry.attempts[0].at === null &&
      !Object.hasOwn(entry.attempts[0], 'correct')) return null;
  return entry.first_try_correct;
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
  let firstTryStreak = 0;
  let streak = 0;
  const measurement = { answered: 0, firstTryCorrect: 0 };
  (blocks || []).forEach((block, index) => {
    if (!ANSWERABLE_BLOCK_TYPES.has(block?.block_type)) return;
    const entry = (checkAnswers || {})[block.id];
    if (!entry) return;
    const firstTryCorrect = checkFirstTryCorrect(entry);
    perBlock.push({
      blockId: block.id,
      stepNumber: index + 1,
      blockType: block.block_type,
      attempts: checkAttemptCount(entry),
      firstTryCorrect,
      finalCorrect: Boolean(entry.correct),
    });
    // Longest run of consecutive first-try successes, in lesson order.
    streak = firstTryCorrect ? streak + 1 : 0;
    if (streak > firstTryStreak) firstTryStreak = streak;
    // Measurement items (plan 6.4 / 1.7): the one-shot checks that are
    // not the retrieval closer — the transfer and SAT-format items whose
    // distractors carry the catalog's traps. First-try there is "you
    // didn't take the bait". Same id convention progress-report.mjs
    // uses to find the retrieval check.
    if (firstTryCorrect != null && isMeasurementCheck(block)) {
      measurement.answered += 1;
      if (firstTryCorrect) measurement.firstTryCorrect += 1;
    }
  });
  return {
    perBlock,
    answered: perBlock.length,
    knownChecks: perBlock.filter(row => row.blockType === 'check' && row.firstTryCorrect != null).length,
    correctChecks: perBlock.filter(row => row.blockType === 'check' && row.firstTryCorrect).length,
    firstTryCorrect: perBlock.filter((row) => row.firstTryCorrect).length,
    struggledBlocks: perBlock.filter((row) => row.attempts >= 3 || !row.finalCorrect),
    firstTryStreak,
    measurement,
  };
}

function isMeasurementCheck(block) {
  if (block?.block_type !== 'check') return false;
  if (block?.content?.allow_retry) return false;
  return !/retrieval/i.test(String(block?.id ?? block?.content?.id ?? ''));
}

// Completion-banner highlights (plan 6.4): reward the right thing. The
// score line already reports first-try accuracy; these name the moments
// worth naming — a clean run, a streak, and the measurement items where
// the learner walked past the trap the SAT set. Never more than two, and
// nothing when nothing was earned: an empty list is an honest banner.
export function completionHighlights(tally) {
  const out = [];
  const answered = tally?.answered ?? 0;
  const firstTry = tally?.firstTryCorrect ?? 0;
  const streak = tally?.firstTryStreak ?? 0;
  if (answered >= 3 && firstTry === answered) {
    out.push('Clean run — every check on the first try.');
  } else if (streak >= 3) {
    out.push(`Longest first-try streak: ${streak} in a row.`);
  }
  const m = tally?.measurement;
  if (m && m.answered >= 1 && m.firstTryCorrect >= 1) {
    if (m.firstTryCorrect === m.answered) {
      out.push(
        m.answered === 1
          ? "The test-style item, first try — you didn't take the bait."
          : `All ${m.answered} test-style items on the first try. The SAT set its traps; you walked past them.`,
      );
    } else {
      out.push(`You didn't take the bait on ${m.firstTryCorrect} of ${m.answered} test-style items.`);
    }
  }
  return out.slice(0, 2);
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
