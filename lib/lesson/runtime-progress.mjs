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
