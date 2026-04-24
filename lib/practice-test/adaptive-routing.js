// Adaptive module-2 routing for practice tests.
//
// The digital SAT (and our practice tests modeled on it) is a
// 2-module-per-section adaptive format:
//   - Module 1 is the same for everyone (standard difficulty).
//   - Module 2 is either "easy" or "hard" depending on how the
//     student did on module 1.
//
// The decision is a simple threshold compare: if the student's
// raw-correct count in module 1 is ≥ the section's threshold,
// they get the hard module; otherwise the easy one. Thresholds
// are stored per test in practice_tests_v2.{rw,math}_route_threshold.
//
// This module is pure function — no DB, no side effects. Callers
// pass in the raw count and threshold; we return a route_code the
// caller can then use to select the right practice_test_modules_v2
// row for module 2.

/**
 * @param {object} args
 * @param {'RW' | 'MATH'} args.subject
 * @param {number} args.module1CorrectCount - raw-correct on module 1
 * @param {number | null | undefined} args.threshold - from practice_tests_v2
 * @returns {'easy' | 'hard' | 'std'} - the route_code to use for module 2
 */
export function chooseModule2Route({ subject, module1CorrectCount, threshold }) {
  // If the test defines no threshold for this section, the test
  // isn't adaptive on that side — serve the 'std' module 2.
  if (threshold == null || !Number.isFinite(threshold)) return 'std';

  // Integer comparison. The SAT's threshold semantic is "at least
  // N correct → hard"; we mirror that with >=.
  return module1CorrectCount >= threshold ? 'hard' : 'easy';
}

/**
 * Which modules this test exposes for a given subject. Useful for
 * validating that the test actually has the route the router picked
 * (e.g. a test marked is_adaptive=true but missing its 'hard' row
 * falls back to 'std' so the student isn't stuck).
 *
 * @param {Array<{subject_code: string, module_number: number, route_code: string}>} modules
 * @param {'RW'|'MATH'} subject
 * @param {number} moduleNumber
 * @returns {Set<string>} - set of route_codes available
 */
export function availableRoutes(modules, subject, moduleNumber) {
  const routes = new Set();
  for (const m of modules) {
    if (m.subject_code === subject && m.module_number === moduleNumber) {
      routes.add(m.route_code);
    }
  }
  return routes;
}

/**
 * Fallback chain: prefer the requested route, then std, then
 * whichever module 2 exists. The runner calls this after
 * chooseModule2Route() to guarantee a concrete module row.
 */
export function resolveRoute(availableSet, preferred) {
  if (availableSet.has(preferred)) return preferred;
  if (availableSet.has('std')) return 'std';
  // Last resort: any module that exists. This shouldn't happen for
  // a published test but guards against half-seeded data.
  const first = availableSet.values().next();
  return first.done ? null : first.value;
}
