// Least-recently-attempted ordering over a candidate question set.
// PURE: attempts are passed in, never queried here — the two callers
// fetch them differently but want the identical ordering.
//
// Used by the review queue's skill / lesson_check micro-drills
// (lib/review/queue.ts) and the end-of-lesson practice drill
// (lib/lesson/practice-drill.ts). Both are "give this student
// something to work on in this skill", and both must prefer material
// the student hasn't seen recently — a never-attempted question sorts
// first, so a fresh topic drills new questions rather than returning
// nothing.
//
// This is deliberately NOT the weak-queue's scoring: that keeps only
// questions the student has already missed, which is empty for a
// just-taught skill.

/**
 * Most-recent attempt timestamp per question id.
 *
 * @param {ReadonlyArray<{question_id: string, created_at: string}>} attempts
 *   Attempt rows, any order.
 * @returns {Map<string, string>} question id → latest created_at.
 */
export function lastAttemptByQuestion(attempts) {
  const latest = new Map();
  for (const a of attempts || []) {
    if (!a?.question_id) continue;
    const prev = latest.get(a.question_id);
    if (prev === undefined || String(a.created_at ?? '') > prev) {
      latest.set(a.question_id, String(a.created_at ?? ''));
    }
  }
  return latest;
}

/**
 * Order candidates least-recently-attempted first. Never-attempted
 * questions sort ahead of every attempted one (empty string is the
 * oldest possible timestamp). Stable for equal timestamps, so the
 * caller's incoming order breaks ties deterministically.
 *
 * @param {ReadonlyArray<string>} candidateIds
 * @param {ReadonlyArray<{question_id: string, created_at: string}>} attempts
 * @returns {string[]}
 */
export function rankLeastRecentlyAttempted(candidateIds, attempts) {
  const latest = lastAttemptByQuestion(attempts);
  return [...(candidateIds || [])].sort(
    (a, b) => (latest.get(a) ?? '').localeCompare(latest.get(b) ?? ''),
  );
}
