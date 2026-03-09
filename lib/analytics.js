/**
 * Performance analytics utilities for the SAT practice app.
 * These functions compute insights from practice data on the client side.
 */

/**
 * Compute accuracy breakdown by difficulty level.
 * @param {Array} attempts - Array of { difficulty, is_correct } objects
 * @returns {Object} { 1: { correct, total, pct }, 2: ..., 3: ... }
 */
export function accuracyByDifficulty(attempts) {
  const buckets = { 1: { correct: 0, total: 0 }, 2: { correct: 0, total: 0 }, 3: { correct: 0, total: 0 } };

  for (const a of attempts) {
    const d = a.difficulty;
    if (d >= 1 && d <= 3) {
      buckets[d].total++;
      if (a.is_correct) buckets[d].correct++;
    }
  }

  for (const d of [1, 2, 3]) {
    buckets[d].pct = buckets[d].total > 0
      ? Math.round((buckets[d].correct / buckets[d].total) * 100)
      : null;
  }

  return buckets;
}

/**
 * Compute accuracy breakdown by domain.
 * @param {Array} attempts - Array of { domain_name, is_correct } objects
 * @returns {Object} { [domain_name]: { correct, total, pct } }
 */
export function accuracyByDomain(attempts) {
  const result = {};

  for (const a of attempts) {
    const domain = a.domain_name || 'Unknown';
    if (!result[domain]) result[domain] = { correct: 0, total: 0 };
    result[domain].total++;
    if (a.is_correct) result[domain].correct++;
  }

  for (const key of Object.keys(result)) {
    result[key].pct = result[key].total > 0
      ? Math.round((result[key].correct / result[key].total) * 100)
      : null;
  }

  return result;
}

/**
 * Compute a rolling accuracy trend over sessions.
 * Groups attempts by session (using a time gap threshold) and returns
 * per-session accuracy.
 *
 * @param {Array} attempts - Array of { created_at, is_correct } sorted by created_at asc
 * @param {number} [gapMs=7200000] - Gap in ms to split sessions (default 2 hours)
 * @returns {Array} [{ startedAt, correct, total, pct }]
 */
export function accuracyTrend(attempts, gapMs = 2 * 60 * 60 * 1000) {
  if (!attempts.length) return [];

  const sessions = [];
  let current = { startedAt: attempts[0].created_at, correct: 0, total: 0 };

  for (const a of attempts) {
    const t = new Date(a.created_at).getTime();
    const prevT = new Date(current.startedAt).getTime();

    if (t - prevT > gapMs && current.total > 0) {
      current.pct = Math.round((current.correct / current.total) * 100);
      sessions.push(current);
      current = { startedAt: a.created_at, correct: 0, total: 0 };
    }

    current.total++;
    if (a.is_correct) current.correct++;
  }

  if (current.total > 0) {
    current.pct = Math.round((current.correct / current.total) * 100);
    sessions.push(current);
  }

  return sessions;
}

/**
 * Identify the weakest and strongest topics from topic stats.
 * @param {Array} topicStats - Array of { skill_name, correct, attempted }
 * @param {number} [minAttempts=3] - Minimum attempts to be considered
 * @returns {{ weakest: Object|null, strongest: Object|null }}
 */
export function findWeakAndStrong(topicStats, minAttempts = 3) {
  const eligible = topicStats
    .filter((t) => t.attempted >= minAttempts)
    .map((t) => ({
      ...t,
      pct: Math.round((t.correct / t.attempted) * 100),
    }));

  if (!eligible.length) return { weakest: null, strongest: null };

  eligible.sort((a, b) => a.pct - b.pct);

  return {
    weakest: eligible[0],
    strongest: eligible[eligible.length - 1],
  };
}

/**
 * Calculate a "mastery score" for a topic based on recent performance.
 * Weights recent attempts more heavily than older ones.
 *
 * @param {Array} attempts - Array of { is_correct } in chronological order (oldest first)
 * @param {number} [decayFactor=0.8] - Weight decay for older attempts
 * @returns {number} Score between 0 and 100
 */
export function masteryScore(attempts, decayFactor = 0.8) {
  if (!attempts.length) return 0;

  let weightedCorrect = 0;
  let totalWeight = 0;

  // Process from newest to oldest
  for (let i = attempts.length - 1; i >= 0; i--) {
    const age = attempts.length - 1 - i;
    const weight = Math.pow(decayFactor, age);
    totalWeight += weight;
    if (attempts[i].is_correct) weightedCorrect += weight;
  }

  return totalWeight > 0 ? Math.round((weightedCorrect / totalWeight) * 100) : 0;
}

/**
 * Compute average time spent per question by difficulty.
 * @param {Array} attempts - Array of { difficulty, time_spent_ms }
 * @returns {Object} { 1: avgMs, 2: avgMs, 3: avgMs }
 */
export function avgTimeByDifficulty(attempts) {
  const buckets = { 1: { total: 0, count: 0 }, 2: { total: 0, count: 0 }, 3: { total: 0, count: 0 } };

  for (const a of attempts) {
    const d = a.difficulty;
    if (d >= 1 && d <= 3 && a.time_spent_ms > 0) {
      buckets[d].total += a.time_spent_ms;
      buckets[d].count++;
    }
  }

  return {
    1: buckets[1].count > 0 ? Math.round(buckets[1].total / buckets[1].count) : null,
    2: buckets[2].count > 0 ? Math.round(buckets[2].total / buckets[2].count) : null,
    3: buckets[3].count > 0 ? Math.round(buckets[3].total / buckets[3].count) : null,
  };
}

/**
 * Suggest topics to review based on recent performance.
 * Returns topics sorted by a priority score (low accuracy + high attempt count).
 *
 * @param {Array} topicStats - Array of { skill_name, domain_name, correct, attempted }
 * @param {number} [limit=5] - Max number of suggestions
 * @returns {Array} Sorted array of { skill_name, domain_name, correct, attempted, pct, priority }
 */
export function suggestReviewTopics(topicStats, limit = 5) {
  return topicStats
    .filter((t) => t.attempted >= 2)
    .map((t) => {
      const pct = t.attempted > 0 ? (t.correct / t.attempted) * 100 : 100;
      // Priority: lower accuracy and more attempts = higher priority
      const priority = (100 - pct) * Math.log2(t.attempted + 1);
      return { ...t, pct: Math.round(pct), priority };
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}
