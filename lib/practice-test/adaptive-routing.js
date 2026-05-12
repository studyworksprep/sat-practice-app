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

// Default thresholds, used when a test row is missing its inline
// rw_route_threshold / math_route_threshold values. These mirror
// the legacy `/api/practice-tests/.../submit-module/route.js`
// hard-coded defaults so the next-tree code lands on the same
// route a student would have gotten under the old code path.
//
// Previous behaviour: a NULL threshold caused chooseModule2Route
// to return 'std', which doesn't exist as a module-2 route_code,
// which made resolveRoute fall through to the first module the
// availableSet iterator yielded — physical row order for the test,
// which for PT5–PT11 happened to be 'easy'. Every student on
// those tests was routed to easy regardless of score until
// 2026-05-11, when we backfilled the threshold columns and added
// these defaults as a belt-and-suspenders fallback.
const DEFAULT_THRESHOLDS = { RW: 15, MATH: 14 };

/**
 * @param {object} args
 * @param {'RW' | 'MATH'} args.subject
 * @param {number} args.module1CorrectCount - raw-correct on module 1
 * @param {number | null | undefined} args.threshold - from practice_tests_v2
 * @returns {'easy' | 'hard'} - the route_code to use for module 2
 */
export function chooseModule2Route({ subject, module1CorrectCount, threshold }) {
  const effective = Number.isFinite(threshold)
    ? threshold
    : (DEFAULT_THRESHOLDS[subject] ?? 15);
  return module1CorrectCount >= effective ? 'hard' : 'easy';
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
 * Fallback chain: prefer the requested route, then 'std', then
 * the conservative 'easy', then any module that exists. The
 * runner calls this after chooseModule2Route() to guarantee a
 * concrete module row.
 *
 * The deterministic 'easy' fallback exists because Set iteration
 * order is insertion order, and the calling code builds the Set
 * from a Postgres query with no ORDER BY — so the prior "first
 * value the iterator yields" fallback was effectively random per
 * test and silently misrouted students on half-configured tests.
 */
export function resolveRoute(availableSet, preferred) {
  if (availableSet.has(preferred)) return preferred;
  if (availableSet.has('std'))     return 'std';
  if (availableSet.has('easy'))    return 'easy';
  if (availableSet.has('hard'))    return 'hard';
  // Last resort: any module that exists. This shouldn't happen
  // for a published test but guards against half-seeded data.
  const first = availableSet.values().next();
  return first.done ? null : first.value;
}
