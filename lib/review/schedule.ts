// SM-2-lite scheduling for the spaced-repetition queue (upgrade
// plan §3.1). PURE: no I/O, `now` is always an input (never
// Date.now()), matching the lib/plan pattern, so the scheduling
// policy is fully unit-testable (schedule.test.mjs).
//
// "Lite" relative to real SM-2: three outcomes instead of a 0-5
// quality grade, and intervals are capped at a test-prep horizon —
// an SAT student's test is weeks away, so an interval that grows
// past ~a month has left the useful range. The state columns map
// 1:1 onto review_queue (interval_days, ease, lapses, last_result,
// due_at, last_reviewed_at).

export type ReviewItemType = 'question' | 'skill' | 'flashcard' | 'vocab';

/** The three outcomes a review can have:
 *  again — missed it (a lapse; interval resets to the floor)
 *  good  — got it (interval grows by ease)
 *  easy  — got it comfortably (grows faster, ease creeps up) */
export type ReviewResult = 'again' | 'good' | 'easy';

/** The scheduling state stored per review_queue row. */
export interface ReviewScheduleState {
  intervalDays: number;
  ease: number;
  lapses: number;
}

export interface ReviewSchedule extends ReviewScheduleState {
  lastResult: ReviewResult;
  /** ISO timestamp of this review — write to last_reviewed_at. */
  lastReviewedAtIso: string;
  /** ISO timestamp the item comes due again — write to due_at. */
  dueAtIso: string;
}

// ── Tunable knobs (explicit, like generate-plan.ts) ────────────────
const LAPSE_INTERVAL_DAYS = 1;   // §3.1: wrong answers come back at 1-2 days
const FIRST_GOOD_INTERVAL_DAYS = 3;
const FIRST_EASY_INTERVAL_DAYS = 5;
const MAX_INTERVAL_DAYS = 30;    // test-prep horizon, not language-learning
const DEFAULT_EASE = 2.5;        // classic SM-2 starting ease
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const LAPSE_EASE_PENALTY = 0.2;
const EASY_EASE_BONUS = 0.1;

const DAY_MS = 86_400_000;

function clampEase(e: number): number {
  return Math.max(MIN_EASE, Math.min(MAX_EASE, e));
}

/**
 * Compute the next scheduling state after a review.
 *
 * `prev` is null when the item isn't in the queue yet (first intake):
 * a wrong answer enqueues at the lapse floor with lapses=1; a correct
 * first sighting starts at the first-good/easy interval (used by
 * flashcard ratings, where a confident rating should still schedule a
 * far-out check rather than staying random).
 */
export function nextSchedule(
  prev: ReviewScheduleState | null,
  result: ReviewResult,
  nowIso: string,
): ReviewSchedule {
  const ease = clampEase(prev?.ease ?? DEFAULT_EASE);
  const interval = Math.max(prev?.intervalDays ?? 0, 0);
  const lapses = Math.max(prev?.lapses ?? 0, 0);

  let nextInterval: number;
  let nextEase: number;
  let nextLapses = lapses;

  if (result === 'again') {
    nextInterval = LAPSE_INTERVAL_DAYS;
    nextEase = clampEase(ease - LAPSE_EASE_PENALTY);
    nextLapses = lapses + 1;
  } else if (result === 'good') {
    nextInterval = interval < FIRST_GOOD_INTERVAL_DAYS
      ? FIRST_GOOD_INTERVAL_DAYS
      : Math.round(interval * ease);
    nextEase = ease;
  } else {
    nextInterval = interval < FIRST_EASY_INTERVAL_DAYS
      ? FIRST_EASY_INTERVAL_DAYS
      : Math.round(interval * ease * 1.3);
    nextEase = clampEase(ease + EASY_EASE_BONUS);
  }
  nextInterval = Math.min(nextInterval, MAX_INTERVAL_DAYS);

  const now = new Date(nowIso);
  const due = new Date(now.getTime() + nextInterval * DAY_MS);
  return {
    intervalDays: nextInterval,
    ease: nextEase,
    lapses: nextLapses,
    lastResult: result,
    lastReviewedAtIso: now.toISOString(),
    dueAtIso: due.toISOString(),
  };
}

/**
 * Map a flashcard self-rating (0..5, the existing mastery scale) onto
 * a review outcome: 0-2 = still shaky ("No clue".."Hard"), 3-4 = got
 * it, 5 = mastered.
 */
export function masteryToResult(mastery: number): ReviewResult {
  if (mastery <= 2) return 'again';
  if (mastery <= 4) return 'good';
  return 'easy';
}

/** An item is due when its due_at is at or before now. Parses both
 *  sides (Postgres emits `+00:00` offsets, JS emits `Z` — lexical
 *  comparison across the two is not safe). */
export function isDue(dueAtIso: string, nowIso: string): boolean {
  return new Date(dueAtIso).getTime() <= new Date(nowIso).getTime();
}
