/**
 * SAT Score Conversion
 *
 * Scoring priority:
 *   1. Exact match in score_conversion table
 *   2. Interpolate between nearest known data points (same route)
 *   3. Piecewise linear model based on easy/hard route
 *
 * All scores are rounded to the nearest 10 and clamped to 200–800.
 */

function roundTo10(n) {
  return Math.round(n / 10) * 10;
}

function clamp(n) {
  return Math.min(800, Math.max(200, n));
}

// ── Default question counts per section ────────────────────────
const DEFAULTS = {
  reading_writing: { m1Count: 27, m2Count: 27, threshold: 18 },
  math:            { m1Count: 22, m2Count: 22, threshold: 14 },
};

// ── Route detection ─────────────────────────────────────────────
// Matches route codes like "hard", "H", "2" but NOT strings that merely
// contain the letter "h" (e.g. "math", "the_easy_route").
const HARD_ROUTE_RE = /^(hard|h|2)$/i;

/**
 * Determine whether a route_code indicates the "hard" (upper) adaptive path.
 * Exported so other modules can reuse the same logic.
 */
export function isHardRoute(routeCode) {
  if (!routeCode) return false;
  return HARD_ROUTE_RE.test(String(routeCode).trim());
}

// ── Route ranges ───────────────────────────────────────────────
// Based on observed SAT scoring patterns:
// - Easy route: 200-540 (can't reach top scores from the easy path)
// - Hard route: 450-800 (floor is higher, ceiling is 800)
// Missing questions on hard route cost ~12-15 points each on average.
const ROUTE_RANGES = {
  easy: { min: 200, max: 540 },
  hard: { min: 450, max: 800 },
};

// Points lost per missed question (approximate, varies by test)
const MISS_PENALTY = {
  easy: { reading_writing: 6, math: 8 },
  hard: { reading_writing: 12, math: 13 },
};

/**
 * Piecewise linear fallback model.
 * For the hard route, scores down from 800 based on missed questions
 * rather than scaling up linearly. This better matches actual SAT scoring
 * where each missed question on hard route costs ~12-15 points.
 */
function piecewiseFallback(section, m1Correct, m2Correct, routeCode) {
  const def = DEFAULTS[section] || DEFAULTS.math;
  const maxTotal = def.m1Count + def.m2Count;
  const total = m1Correct + m2Correct;
  const missed = maxTotal - total;

  // Determine route from routeCode, or infer from module 1 threshold
  let route = 'easy';
  if (routeCode) {
    route = isHardRoute(routeCode) ? 'hard' : 'easy';
  } else {
    route = m1Correct >= def.threshold ? 'hard' : 'easy';
  }

  const range = ROUTE_RANGES[route];
  const sectionKey = section === 'reading_writing' ? 'reading_writing' : 'math';

  if (route === 'hard') {
    // Score down from 800 based on missed questions
    const penalty = MISS_PENALTY.hard[sectionKey];
    const raw = 800 - (missed * penalty);
    return clamp(roundTo10(Math.max(raw, range.min)));
  } else {
    // Easy route: linear scale from min to max
    const fraction = maxTotal > 0 ? total / maxTotal : 0;
    return clamp(roundTo10(range.min + fraction * (range.max - range.min)));
  }
}

/**
 * Interpolate between two known data points based on total correct.
 */
function interpolate(lower, upper, targetTotal) {
  const lowerTotal = lower.module1_correct + lower.module2_correct;
  const upperTotal = upper.module1_correct + upper.module2_correct;
  if (upperTotal === lowerTotal) return lower.scaled_score;
  const t = (targetTotal - lowerTotal) / (upperTotal - lowerTotal);
  return clamp(roundTo10(lower.scaled_score + t * (upper.scaled_score - lower.scaled_score)));
}

/**
 * Score a single section using lookup data + interpolation + fallback.
 *
 * @param {Object} opts
 * @param {string} opts.section        - 'reading_writing' or 'math'
 * @param {number} opts.m1Correct      - correct answers in module 1
 * @param {number} opts.m2Correct      - correct answers in module 2
 * @param {string} [opts.routeCode]    - 'easy'/'hard' or the DB route_code
 * @param {Array}  [opts.lookupRows]   - score_conversion rows for this test+section
 * @returns {number} scaled score (200–800, multiple of 10)
 */
export function computeScaledScore({ section, m1Correct, m2Correct, routeCode, lookupRows }) {
  const rows = lookupRows || [];

  // 1. Exact match
  const exact = rows.find(
    (r) => r.module1_correct === m1Correct && r.module2_correct === m2Correct
  );
  if (exact) return exact.scaled_score;

  // 2. Interpolate between nearest known points
  // Filter to rows on the same route (same m1_correct value, which implies same route)
  // Or more broadly, rows where the route would be the same
  if (rows.length >= 2) {
    const total = m1Correct + m2Correct;

    // Find rows with the same m1_correct (same adaptive route)
    let sameRoute = rows.filter((r) => r.module1_correct === m1Correct);

    // If no rows with exact m1, broaden to rows that share the same route
    if (sameRoute.length < 2) {
      const def = DEFAULTS[section] || DEFAULTS.math;
      const isHard = routeCode
        ? isHardRoute(routeCode)
        : m1Correct >= def.threshold;

      sameRoute = rows.filter((r) => {
        const rIsHard = r.module1_correct >= def.threshold;
        return rIsHard === isHard;
      });
    }

    if (sameRoute.length >= 2) {
      // Sort by total correct
      const sorted = sameRoute
        .map((r) => ({ ...r, total: r.module1_correct + r.module2_correct }))
        .sort((a, b) => a.total - b.total);

      // Find bounding pair
      let lower = null;
      let upper = null;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].total <= total) lower = sorted[i];
        if (sorted[i].total >= total && !upper) upper = sorted[i];
      }

      if (lower && upper && lower !== upper) {
        return interpolate(lower, upper, total);
      }
      // Extrapolate from closest pair if target is outside range
      if (lower && !upper) {
        // Above all known points — extrapolate from last two
        const a = sorted[sorted.length - 2];
        const b = sorted[sorted.length - 1];
        return interpolate(a, b, total);
      }
      if (!lower && upper) {
        // Below all known points — extrapolate from first two
        const a = sorted[0];
        const b = sorted[1];
        return interpolate(a, b, total);
      }
    }
  }

  // 3. Piecewise linear fallback
  return piecewiseFallback(section, m1Correct, m2Correct, routeCode);
}

/**
 * Legacy API — simple linear approximation for backward compat.
 * Used by pages that only have aggregate (correct, total) counts.
 */
export function toScaledScore(correct, total) {
  if (!total || total === 0) return 200;
  const raw = Math.max(0, Math.min(correct, total));
  return clamp(roundTo10(200 + (raw / total) * 600));
}
