// Superscore + impact math for the Roster page's archived view.
//
// Definitions (from the spec):
//
//   Superscore = highest RW score across a set of tests + highest
//                Math score across the same set, even when those
//                two highs come from different test sittings.
//
//   Starting score = superscored official scores from BEFORE the
//                    student's start_date. Falls back to the
//                    practice test composite closest to start_date,
//                    preferring pre-start tests on ties.
//
//   Final score    = superscored official scores across the whole
//                    history. Falls back to the highest practice
//                    test composite overall.
//
//   Score impact   = final - starting.
//
//   Target reach % = round(final / target * 100). Null when target
//                    is unset or final is null.
//
// Tolerant of empty inputs — every helper returns null rather than
// throwing when the relevant data is missing, so the caller can
// render an em-dash without branching.

/**
 * @typedef {object} OfficialScoreRow
 * @property {string} test_date
 * @property {number} rw_score
 * @property {number} math_score
 * @property {number} composite_score
 *
 * @typedef {object} PracticeTestRow
 * @property {string|null} finished_at
 * @property {string|null} started_at
 * @property {number|null} composite_score
 *
 * @typedef {object} ArchiveSummary
 * @property {number|null} startingScore
 * @property {number|null} finalScore
 * @property {number|null} impact
 * @property {number|null} targetReachPct
 */

/** Highest RW + highest Math across a set of test rows. */
export function superscore(tests) {
  if (!tests || tests.length === 0) return null;
  let maxRw = 0;
  let maxMath = 0;
  let any = false;
  for (const t of tests) {
    if (typeof t.rw_score === 'number' && t.rw_score > maxRw) maxRw = t.rw_score;
    if (typeof t.math_score === 'number' && t.math_score > maxMath) maxMath = t.math_score;
    if (typeof t.rw_score === 'number' || typeof t.math_score === 'number') any = true;
  }
  return any ? maxRw + maxMath : null;
}

/** Practice test closest to startDate, preferring pre-start on ties. */
function closestPracticeTest(tests, startMs) {
  if (!tests || tests.length === 0) return null;
  if (startMs == null) return null;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  let bestPre = false;
  for (const t of tests) {
    const ts = Date.parse(t.finished_at ?? t.started_at ?? '');
    if (!Number.isFinite(ts)) continue;
    if (t.composite_score == null) continue;
    const dist = Math.abs(ts - startMs);
    const pre = ts <= startMs;
    if (
      best == null
      || dist < bestDist
      || (dist === bestDist && pre && !bestPre)
    ) {
      best = t;
      bestDist = dist;
      bestPre = pre;
    }
  }
  return best;
}

/** Compute the archive summary for one student. Pass everything
 *  the loader fetched — official scores, practice-test attempts,
 *  start_date (already defaulted to created_at if missing), and
 *  the target SAT score. */
export function buildArchiveSummary({
  officialScores = [],
  practiceTests = [],
  startDate,
  targetScore,
}) {
  const startMs = startDate ? Date.parse(startDate) : null;

  // Starting score — pre-start officials, else closest practice.
  let startingScore = null;
  if (startMs != null) {
    const preStart = officialScores.filter(
      (s) => s.test_date && Date.parse(s.test_date) < startMs,
    );
    startingScore = superscore(preStart);
  }
  if (startingScore == null) {
    const fallback = closestPracticeTest(practiceTests, startMs);
    startingScore = fallback?.composite_score ?? null;
  }

  // Final score — superscored official scores. Fall back to the
  // highest practice composite when there are no officials.
  let finalScore = superscore(officialScores);
  if (finalScore == null && practiceTests.length > 0) {
    let max = null;
    for (const t of practiceTests) {
      if (typeof t.composite_score === 'number') {
        max = max == null ? t.composite_score : Math.max(max, t.composite_score);
      }
    }
    finalScore = max;
  }

  const impact = (finalScore != null && startingScore != null)
    ? finalScore - startingScore
    : null;

  const targetReachPct = (finalScore != null && typeof targetScore === 'number' && targetScore > 0)
    ? Math.round((finalScore / targetScore) * 100)
    : null;

  return { startingScore, finalScore, impact, targetReachPct };
}
