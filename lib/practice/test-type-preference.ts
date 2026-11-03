// Student SAT/ACT preference — which test the practice surfaces open on.
//
// One switch in the student sidebar sets it; /practice/start,
// /practice/tests and /practice/history read it when the URL carries no
// explicit `?test=`. Stored in a plain cookie, deliberately NOT a
// profile column: students switch tests as dates approach, so this is a
// "last used" convenience, not a stable identity fact (see
// docs/upgrade-plan-2026-07.md §6.1, 2026-11 note). An explicit
// `?test=sat|act` in the URL always wins, so deep links keep working.
//
// Pure helpers only; the cookie read/write lives in the server action
// (test-type-actions.ts) and the server-only resolver below.

export type TestType = 'sat' | 'act';

export const TEST_TYPE_COOKIE = 'sw_test_type';

/** One year — the preference outlives any single prep cycle. */
export const TEST_TYPE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Normalize anything (cookie value, search param) to a TestType or null. */
export function parseTestType(value: unknown): TestType | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return v === 'sat' || v === 'act' ? v : null;
}

/** URL param beats the stored preference; SAT is the default. */
export function pickTestType(param: unknown, stored: unknown): TestType {
  return parseTestType(param) ?? parseTestType(stored) ?? 'sat';
}
