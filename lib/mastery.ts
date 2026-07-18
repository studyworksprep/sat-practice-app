// Mastery computation — the single home for the formula.
//
// The pure aggregate→score core (`masteryFromAggregates`) is mirrored
// VERBATIM in SQL as public.compute_mastery_score (migration
// 20260713120000_skill_mastery_snapshots.sql) and pinned by the shared
// test vector in lib/mastery.fixtures.json. Change all three together —
// the unit test (lib/mastery.test.mjs) and the migration's fixture query
// are the guardrails that keep the JS and SQL implementations identical.
//
// `computeMastery` is the historical public API (attempts + taxMap →
// 0-100), still called by the Lessonworks sync (lib/lessonworksSync.js).
// It now delegates its arithmetic to `masteryFromAggregates` so there is
// exactly one formula.

export const DIFF_WEIGHT: Record<number, number> = { 1: 0.6, 2: 1.0, 3: 1.5 };
export const MASTERY_BAND_WEIGHT: Record<number, number> = {
  1: 0.7, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3, 6: 1.5, 7: 1.7,
};
export const VOLUME_CURVE = 0.15;
/** §3.2: a correct answer reached with hints contributes half its
 *  weight to weightedCorrect (weightedTotal unchanged). Mirrored in
 *  SQL inside get_skill_mastery_asof (migration 20260718121000). */
export const HINT_CORRECT_FACTOR = 0.5;

/** Per-attempt weight: difficulty weight × score-band weight. Unknown or
 *  null difficulty falls back to 1.0; unknown or null band to 1.15 —
 *  matching the `|| 1.0` / `|| 1.15` fallbacks and the SQL mastery_weight. */
export function masteryWeight(
  difficulty: number | null | undefined,
  scoreBand: number | null | undefined,
): number {
  const dw = DIFF_WEIGHT[difficulty as number] || 1.0;
  const bw = MASTERY_BAND_WEIGHT[scoreBand as number] || 1.15;
  return dw * bw;
}

export interface MasteryAggregates {
  weightedCorrect: number;
  weightedTotal: number;
  attemptsCount: number;
  recentTotal: number;
  recentCorrect: number;
}

/**
 * The pure mastery formula. Mirrored verbatim in SQL as
 * public.compute_mastery_score; pinned by lib/mastery.fixtures.json.
 *
 *   raw_accuracy  = weightedCorrect / weightedTotal   (0 if total 0)
 *   volume_factor = 1 - exp(-0.15 * attemptsCount)
 *   recency_bonus = 0.05 if recentTotal >= 3 and recentCorrect/recentTotal > 0.7
 *   mastery       = round(raw_accuracy * volume_factor * (1 + bonus) * 100), capped 100
 */
export function masteryFromAggregates(a: MasteryAggregates): number {
  const rawAccuracy = a.weightedTotal > 0 ? a.weightedCorrect / a.weightedTotal : 0;
  const volumeFactor = 1 - Math.exp(-VOLUME_CURVE * a.attemptsCount);
  const recencyBonus =
    a.recentTotal >= 3 && a.recentCorrect / a.recentTotal > 0.7 ? 0.05 : 0;
  const mastery = rawAccuracy * volumeFactor * (1 + recencyBonus);
  return Math.min(Math.round(mastery * 100), 100);
}

export interface MasteryAttempt {
  question_id: string;
  is_correct: boolean;
  created_at: string | number | Date;
  /** §3.2: hints revealed before answering (attempts.response_json
   *  hints_used). Omitted/null/0 = unassisted. */
  hints_used?: number | null;
}

export interface MasteryTaxEntry {
  difficulty?: number | null;
  score_band?: number | null;
}

/**
 * Compute a mastery score (0–100) for a set of attempts within a domain
 * or skill, weighted by question difficulty and score-band. Returns null
 * if there are no attempts.
 *
 * @param attempts — rows, each with { question_id, is_correct, created_at }
 * @param taxMap   — question_id → { difficulty, score_band }
 */
export function computeMastery(
  attempts: MasteryAttempt[],
  taxMap: Record<string, MasteryTaxEntry>,
): number | null {
  if (!attempts.length) return null;

  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const a of attempts) {
    const tax = taxMap[a.question_id];
    const w = masteryWeight(tax?.difficulty, tax?.score_band);
    weightedTotal += w;
    if (a.is_correct) {
      weightedCorrect += (a.hints_used ?? 0) > 0 ? w * HINT_CORRECT_FACTOR : w;
    }
  }

  // Recency bonus: +5% if recent (14-day) accuracy > 70% with 3+ attempts.
  const now = Date.now();
  const DAY = 86400000;
  let recentCorrect = 0;
  let recentTotal = 0;
  for (const a of attempts) {
    if (now - new Date(a.created_at).getTime() <= 14 * DAY) {
      recentTotal++;
      if (a.is_correct) recentCorrect++;
    }
  }

  return masteryFromAggregates({
    weightedCorrect,
    weightedTotal,
    attemptsCount: attempts.length,
    recentTotal,
    recentCorrect,
  });
}
