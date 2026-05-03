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
//         3. Piecewise miss-penalty fallback (matches the legacy
//            scoreConversion piecewiseFallback so both trees agree
//            on a score when the lookup is empty for a test).
//       Bluebook uploads write rows into score_conversion keyed by the
//       practice-test UUID, so a recompute on an attempt of the same
//       test with the same per-module correct counts hits step 1 and
//       returns the user-entered College Board score verbatim. New
//       tests with no Bluebook history yet land on step 3.
//
// All scores are rounded to the nearest 10 and clamped to [200, 800] —
// real SAT section scores are always multiples of 10, and surfacing a
// 207 in the UI immediately reads as "broken math". Match the legacy
// scoreConversion.js behavior exactly so the next tree and legacy tree
// produce the same number for the same inputs.
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
   *  piecewise-fallback step when the lookup misses. */
  totalItems: number;
  /** Which module-2 route was taken. */
  route: RouteCode;
  /** score_conversion rows for this practice-test. Either pre-filtered
   *  to one section by the caller, or unfiltered — the helper drops
   *  rows whose section doesn't match `subject`. Empty/undefined is
   *  fine; the function falls straight through to the piecewise
   *  fallback. */
  lookupRows?: ScoreConversionRow[];
}

/**
 * Compute a scaled score for a single section (RW or Math) using
 * the piecewise miss-penalty model (mirrors the legacy
 * scoreConversion.piecewiseFallback). Returns a value in [200, 800]
 * rounded to the nearest 10, or null if inputs are invalid.
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
  const safeRaw = Math.max(0, Math.min(rawCorrect, totalItems));
  // No per-module split — apportion correct counts evenly across the
  // two modules so the piecewise model has something to work with.
  // Real callers should prefer scaleSectionScoreWithLookup, which
  // keeps m1 / m2 distinct.
  const half = Math.round(safeRaw / 2);
  return piecewiseFallback({
    subject,
    m1Correct: half,
    m2Correct: safeRaw - half,
    route,
  });
}

/**
 * Compute a scaled score using the score_conversion lookup table
 * first, falling back to the piecewise miss-penalty model. Mirrors v1
 * lib/scoreConversion.computeScaledScore.
 *
 * Three-step priority:
 *   1. Exact (m1, m2) match in lookupRows for this section.
 *   2. Interpolate / extrapolate between known points on the same
 *      adaptive route.
 *   3. Piecewise miss-penalty fallback.
 *
 * Returns a value in [200, 800] rounded to the nearest 10, or null
 * if inputs are invalid.
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

  // 1. Exact match. Bluebook scores are already multiples of 10, so
  //    just clamp without rounding to preserve the user-entered value
  //    verbatim.
  const exact = rows.find(
    (r) => r.module1_correct === m1Correct && r.module2_correct === m2Correct,
  );
  if (exact) return clamp(exact.scaled_score);

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

  // 3. Piecewise miss-penalty fallback. Matches the legacy
  //    scoreConversion.piecewiseFallback so both trees converge on
  //    the same number when the lookup is empty.
  return piecewiseFallback({
    subject,
    m1Correct,
    m2Correct,
    route,
    totalItems: Number.isFinite(totalItems) && totalItems > 0 ? totalItems : null,
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
// Internal helpers — kept in lockstep with the legacy
// lib/scoreConversion.js so both trees produce identical numbers.
// ──────────────────────────────────────────────────────────────

function roundTo10(n: number): number {
  return Math.round(n / 10) * 10;
}

function clamp(n: number): number {
  return Math.max(200, Math.min(800, n));
}

function clampAndRound(n: number): number {
  return clamp(roundTo10(n));
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

// Defaults match legacy scoreConversion DEFAULTS (per-module item
// counts + the route-detection threshold).
const DEFAULTS: Record<SubjectCode, { m1Count: number; m2Count: number }> = {
  RW:   { m1Count: 27, m2Count: 27 },
  MATH: { m1Count: 22, m2Count: 22 },
};

// Approximate observed adaptive ranges. Matches legacy
// ROUTE_RANGES — easy route caps in the mid-500s, hard route can
// reach 800 from a 450 floor.
const ROUTE_RANGES: Record<'easy' | 'hard', { min: number; max: number }> = {
  easy: { min: 200, max: 540 },
  hard: { min: 450, max: 800 },
};

// Points lost per missed question on each route. Matches legacy
// MISS_PENALTY — hard route ≈ 12–13 per miss, easy route ≈ 6–8.
const MISS_PENALTY: Record<'easy' | 'hard', Record<SubjectCode, number>> = {
  easy: { RW: 6,  MATH: 8 },
  hard: { RW: 12, MATH: 13 },
};

interface PiecewiseInput {
  subject: SubjectCode;
  m1Correct: number;
  m2Correct: number;
  route: RouteCode;
  /** Optional override for total items in the section. When unset
   *  we fall back to DEFAULTS (27+27 for RW, 22+22 for Math). */
  totalItems?: number | null;
}

/**
 * Piecewise linear miss-penalty fallback. Mirrors the legacy
 * scoreConversion.piecewiseFallback verbatim. For the hard route,
 * scores down from 800 by per-miss penalty; for the easy route,
 * linear scale across the route range.
 */
function piecewiseFallback({
  subject,
  m1Correct,
  m2Correct,
  route,
  totalItems = null,
}: PiecewiseInput): number {
  const def = DEFAULTS[subject];
  const maxTotal = totalItems ?? (def.m1Count + def.m2Count);
  const total = m1Correct + m2Correct;
  const missed = Math.max(0, maxTotal - total);

  // route_code is the source of truth when present; otherwise infer
  // from m1 against the route threshold.
  const onHard = isHardRoute(route) || m1Correct >= HARD_THRESHOLD[subject];
  const routeKey: 'easy' | 'hard' = onHard ? 'hard' : 'easy';
  const range = ROUTE_RANGES[routeKey];

  if (routeKey === 'hard') {
    const penalty = MISS_PENALTY.hard[subject];
    const raw = 800 - missed * penalty;
    return clamp(roundTo10(Math.max(raw, range.min)));
  }
  const fraction = maxTotal > 0 ? total / maxTotal : 0;
  return clamp(roundTo10(range.min + fraction * (range.max - range.min)));
}
