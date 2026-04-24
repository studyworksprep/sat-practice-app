// Practice-test scoring helpers.
//
// V1 scoring is deliberately simple: count raw-correct per section
// and run it through a linear approximation that maps
// raw score → scaled 200..800. The real College Board scoring
// uses equating curves that differ per test form, and we don't
// have those lookup tables for our published content — yet. The
// approximation we use here is good enough for students to see a
// "score-out-of-1600" number after finishing, and close enough
// to real College Board scores that the ranking it produces tracks
// reality. We can swap in exact tables by test code later without
// changing callers.
//
// Adaptive scoring detail: module 2 route affects the ceiling. If
// a student gets the easy module 2, their scaled max is capped
// (~530 on RW, ~510 on Math in real College Board scoring). We
// implement that by picking a different linear mapping per route.
//
// First TypeScript canary in the new tree — pure functions, no
// I/O, narrow public surface. Demonstrates the import path
// (`@/lib/types`) for shared domain enums and confirms the
// allowJs: true tsconfig accepts mixed .js + .ts call sites.

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

/**
 * Compute a scaled score for a single section (RW or Math).
 * Returns a value in [200, 800], or null if inputs are invalid.
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

/**
 * Per-route curve. 'hard' route unlocks the full 800 ceiling;
 * 'easy' route caps in the ~500–530 range, which is in line with
 * real College Board adaptive behavior; 'std' sits between (and
 * is what non-adaptive tests use).
 *
 * These are not College Board's actual tables. They are linear
 * approximations calibrated so a solid student on the hard route
 * lands around their real CB score within ~30 points — good
 * enough for directional feedback during practice.
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
