// Mastery computation — shared between teacher dashboard and external API

const DIFF_WEIGHT = { 1: 0.6, 2: 1.0, 3: 1.5 };
const MASTERY_BAND_WEIGHT = { 1: 0.7, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3, 6: 1.5, 7: 1.7 };
const VOLUME_CURVE = 0.15;

/**
 * Compute a mastery score (0–100) for a set of first-attempts within a
 * domain or skill, weighted by question difficulty and score-band.
 *
 * @param {Array} attempts — first-attempt rows, each with { question_id, is_correct, created_at }
 * @param {Object} taxMap  — question_id → { difficulty, score_band, … }
 * @returns {number|null}  — mastery 0-100, or null if no attempts
 */
export function computeMastery(attempts, taxMap) {
  if (!attempts.length) return null;

  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const a of attempts) {
    const tax = taxMap[a.question_id];
    const dw = DIFF_WEIGHT[tax?.difficulty] || 1.0;
    const bw = MASTERY_BAND_WEIGHT[tax?.score_band] || 1.15;
    const w = dw * bw;
    weightedTotal += w;
    if (a.is_correct) weightedCorrect += w;
  }

  const rawAccuracy = weightedTotal > 0 ? weightedCorrect / weightedTotal : 0;
  const volumeFactor = 1 - Math.exp(-VOLUME_CURVE * attempts.length);

  // Recency bonus: +5% if recent (14-day) accuracy > 70% with 3+ questions
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
  const recencyBonus = (recentTotal >= 3 && recentCorrect / recentTotal > 0.7) ? 0.05 : 0;

  const mastery = rawAccuracy * volumeFactor * (1 + recencyBonus);
  return Math.min(Math.round(mastery * 100), 100);
}
