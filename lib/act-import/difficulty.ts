// Difficulty formulas for ACT-import drafts.
//
// Per the design call: ACT difficulty is *progressive* on the
// Math and Science sections in known patterns; on English and
// Reading it isn't labeled in any source we have, so we leave
// those null until a future student-performance pass can
// backfill them.
//
//   Math    — simple proportion. 60 questions → 1-12 = D1,
//             13-24 = D2, 25-36 = D3, 37-48 = D4, 49-60 = D5.
//             Generalized to any total via ceil(ordinal * 5 / total).
//
//   Science — rising-wave: within each passage, the questions
//             ramp from easy to hard; across passages, the
//             peaks also rise. So passage 1's hardest is around
//             a D2, passage 6's easiest is around a D3 and its
//             hardest is at D5. Implemented as a blend of an
//             across-passage and within-passage component.
//
// Both formulas clamp to [1, 5] to match the column's CHECK.

const MIN = 1;
const MAX = 5;

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, n));
}

/** Math difficulty by ordinal position (1-indexed) within the
 *  section. Spreads 1..5 evenly across the question count. */
export function mathDifficulty(ordinal: number, totalQuestions: number): number {
  if (!Number.isFinite(ordinal) || !Number.isFinite(totalQuestions) || totalQuestions <= 0) {
    return MIN;
  }
  return clamp(Math.ceil((ordinal * 5) / totalQuestions));
}

/** Science difficulty for ordinal `i` within passage index
 *  `passageIndex` (0-based) of `passageCount` total passages,
 *  where the passage has `questionsInPassage` questions and the
 *  question is at 1-based position `withinPassage` inside it.
 *
 *  Formula:
 *    across = passageIndex / (passageCount - 1)       in [0,1]
 *    within = (withinPassage - 1) / (questionsInPassage - 1)
 *                                                     in [0,1]
 *    raw    = 1 + 2 * across + 2 * within             in [1,5]
 *
 *  Tuning: with 6 passages, the cheapest in passage 1 is 1.0
 *  (clamped/rounded to 1), the hardest in passage 6 is 5.0
 *  (clamped to 5). Middle passages roughly cover the D2-D4
 *  range, matching the rising-wave intuition. */
export function scienceDifficulty(input: {
  passageIndex: number;
  passageCount: number;
  withinPassage: number;
  questionsInPassage: number;
}): number {
  const { passageIndex, passageCount, withinPassage, questionsInPassage } = input;
  if (passageCount <= 0 || questionsInPassage <= 0) return MIN;
  const across = passageCount > 1 ? passageIndex / (passageCount - 1) : 0;
  const within = questionsInPassage > 1 ? (withinPassage - 1) / (questionsInPassage - 1) : 0;
  const raw = 1 + 2 * across + 2 * within;
  return clamp(Math.round(raw));
}
