// Practice-test scoring helpers.
//
// Two layers, picked at the call site:
//
//   scaleSectionScore({ subject, rawCorrect, totalItems, route })
//     - Pure linear approximation. Used when the caller only has
//       aggregate (correct, total) and no per-module split — and
//       therefore can't query the score_conversion lookup table
//       (which is keyed by m1_correct + m2_correct).
//
//   scaleSectionScoreWithLookup({ subject, m1Correct, m2Correct, route, lookupRows })
//     - Lookup-aware. Mirrors v1 lib/scoreConversion.computeScaledScore:
//         1. Exact match on (m1_correct, m2_correct) in lookupRows
//         2. Interpolate / extrapolate within the same adaptive route
//         3. Fall back to scaleSectionScore (the linear approximation)
//       Bluebook uploads write rows into score_conversion keyed by the
//       practice-test UUID, so a recompute on an attempt of the same
//       test with the same per-module correct counts hits step 1 and
//       returns the user-entered College Board score verbatim. New
//       tests with no Bluebook history yet land on step 3.
//
// Adaptive scoring detail: module 2's route affects the ceiling. If
// a student gets the easy module 2, their scaled max is capped
// (~530 on RW, ~510 on Math in real College Board scoring). The
// linear curves below approximate that; the lookup table — when
// populated — is the truth.
//
// First TypeScript canary in the new tree — pure functions, no
// I/O, narrow public surface.

import type { SubjectCode, RouteCode } from '@/lib/types';

export interface SectionScoreInput {
  subject: SubjectCode;
  rawCorrect: number;
  /** Sum of module 1 + module 2 item counts. */
  totalItems: number;
  /** Which module-2 route was taken. */
  route: RouteCode;
}

export interface CompositeScoreInput {
  rwScaled: number | null;
  mathScaled: number | null;
}

interface Curve { floor: number; ceiling: number; }

/** A row of the score_conversion lookup table, narrowed to the
 *  columns the scoring logic reads. The table keys section as
 *  'reading_writing' / 'math'; SubjectCode is 'RW' / 'MATH'. The
 *  caller is responsible for filtering rows to one section before
 *  passing them in (or letting `scaleSectionScoreWithLookup` do the
 *  filter via the `subject` arg). */
export interface ScoreConversionRow {
  section: 'reading_writing' | 'math';
  module1_correct: number;
  module2_correct: number;
  scaled_score: number;
}

export interface SectionScoreLookupInput {
  subject: SubjectCode;
  m1Correct: number;
  m2Correct: number;
  /** Total items across module 1 + 2 for this section. Used by the
   *  linear-fallback step when the lookup misses. */
  totalItems: number;
  /** Which module-2 route was taken. */
  route: RouteCode;
  /** score_conversion rows for this practice-test. Either pre-filtered
   *  to one section by the caller, or unfiltered — the helper drops
   *  rows whose section doesn't match `subject`. Empty/undefined is
   *  fine; the function falls straight through to linear scaling. */
  lookupRows?: ScoreConversionRow[];
}

/**
 * Compute a scaled score for a single section (RW or Math) using
 * the pure linear approximation. Returns a value in [200, 800], or
 * null if inputs are invalid.
 */
export function scaleSectionScore({
  subject,
  rawCorrect,
  totalItems,
  route,
}: SectionScoreInput): number | null {
  if (!Number.isFinite(rawCorrect) || !Number.isFinite(totalItems) || totalItems <= 0) {
    return null;
  }
  const pct = Math.max(0, Math.min(1, rawCorrect / totalItems));
  const curve = pickCurve(subject, route);
  const scaled = Math.round(curve.floor + (curve.ceiling - curve.floor) * pct);
  return Math.max(200, Math.min(800, scaled));
}

/**
 * Compute a scaled score using the score_conversion lookup table
 * first, falling back to the linear approximation. Mirrors v1
 * lib/scoreConversion.computeScaledScore.
 *
 * Three-step priority:
 *   1. Exact (m1, m2) match in lookupRows for this section.
 *   2. Interpolate / extrapolate between known points on the same
 *      adaptive route.
 *   3. Linear fallback via scaleSectionScore.
 *
 * Returns a value in [200, 800], or null if inputs are invalid.
 */
export function scaleSectionScoreWithLookup({
  subject,
  m1Correct,
  m2Correct,
  totalItems,
  route,
  lookupRows,
}: SectionScoreLookupInput): number | null {
  if (
    !Number.isFinite(m1Correct) ||
    !Number.isFinite(m2Correct) ||
    m1Correct < 0 ||
    m2Correct < 0
  ) {
    return null;
  }

  const sectionKey = subject === 'RW' ? 'reading_writing' : 'math';
  const rows = (lookupRows ?? []).filter((r) => r.section === sectionKey);

  // 1. Exact match.
  const exact = rows.find(
    (r) => r.module1_correct === m1Correct && r.module2_correct === m2Correct,
  );
  if (exact) return clampAndRound(exact.scaled_score);

  // 2. Interpolate within the same adaptive route. Two passes:
  //    first restrict to rows with the same m1_correct (truly the
  //    same observed route); if that's too sparse, broaden to
  //    "rows whose m1 puts them on the same route side."
  if (rows.length >= 2) {
    const total = m1Correct + m2Correct;

    let sameRoute = rows.filter((r) => r.module1_correct === m1Correct);

    if (sameRoute.length < 2) {
      const isHard = isHardRoute(route);
      sameRoute = rows.filter((r) => onHardSide(r, subject) === isHard);
    }

    if (sameRoute.length >= 2) {
      const sorted = sameRoute
        .map((r) => ({ row: r, total: r.module1_correct + r.module2_correct }))
        .sort((a, b) => a.total - b.total);

      let lower: typeof sorted[number] | null = null;
      let upper: typeof sorted[number] | null = null;
      for (const entry of sorted) {
        if (entry.total <= total) lower = entry;
        if (entry.total >= total && upper === null) upper = entry;
      }

      if (lower && upper && lower !== upper) {
        return interpolate(lower, upper, total);
      }
      // Above all known points — extrapolate from the top two.
      if (lower && !upper && sorted.length >= 2) {
        return interpolate(sorted[sorted.length - 2], sorted[sorted.length - 1], total);
      }
      // Below all known points — extrapolate from the bottom two.
      if (!lower && upper && sorted.length >= 2) {
        return interpolate(sorted[0], sorted[1], total);
      }
    }
  }

  // 3. Linear fallback.
  return scaleSectionScore({
    subject,
    rawCorrect: m1Correct + m2Correct,
    totalItems,
    route,
  });
}

/**
 * Composite total: RW scaled + Math scaled, each already clipped
 * to [200, 800]. Returns null if either side is null.
 */
export function compositeScore({
  rwScaled,
  mathScaled,
}: CompositeScoreInput): number | null {
  if (rwScaled == null || mathScaled == null) return null;
  return rwScaled + mathScaled;
}

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

function clampAndRound(n: number): number {
  return Math.max(200, Math.min(800, Math.round(n)));
}

function isHardRoute(route: RouteCode): boolean {
  return route === 'hard';
}

// Module-1 thresholds that segment the routing pool. Used as a
// fallback when a lookup row's route can't be derived from
// route_code (the table doesn't store it; we infer from m1_correct
// using the same thresholds the live router applies).
const HARD_THRESHOLD: Record<SubjectCode, number> = { RW: 18, MATH: 14 };

function onHardSide(row: ScoreConversionRow, subject: SubjectCode): boolean {
  return row.module1_correct >= HARD_THRESHOLD[subject];
}

function interpolate(
  lower: { row: ScoreConversionRow; total: number },
  upper: { row: ScoreConversionRow; total: number },
  targetTotal: number,
): number {
  if (upper.total === lower.total) return clampAndRound(lower.row.scaled_score);
  const t = (targetTotal - lower.total) / (upper.total - lower.total);
  const raw = lower.row.scaled_score + t * (upper.row.scaled_score - lower.row.scaled_score);
  return clampAndRound(raw);
}

/**
 * Per-route curve. 'hard' route unlocks the full 800 ceiling;
 * 'easy' route caps in the ~500–530 range, which is in line with
 * real College Board adaptive behavior; 'std' sits between (and
 * is what non-adaptive tests use).
 *
 * These are not College Board's actual tables. They are linear
 * approximations calibrated so a solid student on the hard route
 * lands around their real CB score within ~30 points — good
 * enough for directional feedback during practice. The lookup
 * path above is the better truth when populated.
 */
function pickCurve(subject: SubjectCode, route: RouteCode): Curve {
  const CURVES: Record<SubjectCode, Record<RouteCode, Curve>> = {
    RW: {
      easy: { floor: 200, ceiling: 530 },
      std:  { floor: 200, ceiling: 700 },
      hard: { floor: 400, ceiling: 800 },
    },
    MATH: {
      easy: { floor: 200, ceiling: 510 },
      std:  { floor: 200, ceiling: 700 },
      hard: { floor: 400, ceiling: 800 },
    },
  };
  return CURVES[subject]?.[route] ?? CURVES[subject]?.std ?? { floor: 200, ceiling: 800 };
}
