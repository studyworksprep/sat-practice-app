// Recompute the section + composite scores for a practice-test
// attempt and flip its status to 'completed'.
//
// Single canonical scoring path used by:
//   - The live submit pipeline (closeTestAttempt in
//     app/next/(student)/practice/test/actions.js).
//   - The per-student practice-history import
//     (importStudentPracticeHistory in
//     app/next/(tutor)/tutor/students/[studentId]/actions.js),
//     which calls this for every freshly-imported attempt so that
//     the v2 results page can render against rows that originally
//     came from a v1 Bluebook upload.
//
// Lookup-aware: pulls the test's score_conversion rows once and
// passes them to scaleSectionScoreWithLookup, which prefers an
// exact (m1, m2) match → same-route interpolation → linear
// fallback. Bluebook uploads have been writing score_conversion
// rows keyed by the practice-test UUID, so the lookup hits for
// any imported test that's been uploaded by anyone.
//
// Guards:
//   - Returns early on missing attempt or status='abandoned'
//     (don't promote intentionally-abandoned attempts).
//   - Returns early when there are no module attempts at all
//     (score-only Bluebook imports — nothing to compute).
//   - Returns early without writing when status is already
//     'completed' AND all three score columns are non-null. This
//     preserves user-entered Bluebook scaled scores in the case
//     where the lookup has no rows yet for this test (would
//     otherwise replace real scores with the linear approximation).
//   - Returns early without writing when correct_count is missing
//     on any module attempt (insufficient data to score).

import {
  scaleSectionScoreWithLookup,
  compositeScore,
} from '@/lib/practice-test/scoring';

const SECTION_KEY = { RW: 'reading_writing', MATH: 'math' };

/**
 * @param {object} supabase  - Supabase client (RLS-scoped or service-
 *                             role; the caller picks).
 * @param {string} attemptId - practice_test_attempts_v2.id
 * @returns {Promise<{
 *   ok: true,
 *   changed: boolean,        // whether the row was updated
 *   reason?: string,         // why it was skipped, when changed=false
 *   rwScaled?: number|null,
 *   mathScaled?: number|null,
 *   composite?: number|null,
 * } | { ok: false, error: string }>}
 */
export async function recomputeAttemptScores(supabase, attemptId) {
  if (!attemptId) return { ok: false, error: 'attemptId required' };

  // 1. Attempt row + module attempts joined to module metadata.
  //    One round-trip each for clarity; both are small reads.
  const { data: attempt, error: attemptErr } = await supabase
    .from('practice_test_attempts_v2')
    .select('id, status, practice_test_id, composite_score, rw_scaled, math_scaled')
    .eq('id', attemptId)
    .maybeSingle();
  if (attemptErr) {
    return { ok: false, error: `attempt lookup failed: ${attemptErr.message}` };
  }
  if (!attempt) return { ok: false, error: 'attempt not found' };

  if (attempt.status === 'abandoned') {
    return { ok: true, changed: false, reason: 'abandoned' };
  }

  const { data: moduleAttempts, error: maErr } = await supabase
    .from('practice_test_module_attempts_v2')
    .select(`
      id, correct_count,
      practice_test_module:practice_test_modules_v2(
        id, subject_code, module_number, route_code
      )
    `)
    .eq('practice_test_attempt_id', attemptId);
  if (maErr) {
    return { ok: false, error: `module attempts lookup failed: ${maErr.message}` };
  }

  const modules = moduleAttempts ?? [];
  if (modules.length === 0) {
    // Score-only Bluebook upload — only the attempt row was imported,
    // no module data to recompute from. Leave the existing scores
    // (from user entry) alone.
    return { ok: true, changed: false, reason: 'no module data' };
  }

  if (modules.some((m) => m.correct_count == null)) {
    return { ok: true, changed: false, reason: 'missing correct_count' };
  }

  const scoresPopulated =
    attempt.composite_score != null &&
    attempt.rw_scaled != null &&
    attempt.math_scaled != null;
  if (attempt.status === 'completed' && scoresPopulated) {
    // Already scored. Don't recompute — preserves any user-entered
    // Bluebook scores that landed here without a corresponding
    // score_conversion row.
    return { ok: true, changed: false, reason: 'already scored' };
  }

  // 2. Aggregate per subject: per-module correct counts (m1 / m2),
  //    item-count totals, and the module-2 route (which determines
  //    the scoring ceiling).
  const bySubject = {
    RW:   { m1: 0, m2: 0, totalItems: 0, route: 'std', moduleIds: [] },
    MATH: { m1: 0, m2: 0, totalItems: 0, route: 'std', moduleIds: [] },
  };
  for (const ma of modules) {
    const m = ma.practice_test_module;
    if (!m || !bySubject[m.subject_code]) continue;
    const slot = bySubject[m.subject_code];
    if (m.module_number === 1) slot.m1 += ma.correct_count ?? 0;
    if (m.module_number === 2) {
      slot.m2 += ma.correct_count ?? 0;
      if (m.route_code) slot.route = m.route_code;
    }
    if (m.id) slot.moduleIds.push(m.id);
  }

  // 3. Item counts per subject — one IN query.
  const allModuleIds = [...bySubject.RW.moduleIds, ...bySubject.MATH.moduleIds];
  if (allModuleIds.length > 0) {
    const { data: itemRows, error: itemErr } = await supabase
      .from('practice_test_module_items_v2')
      .select(
        'practice_test_module_id, practice_test_module:practice_test_modules_v2(subject_code)',
      )
      .in('practice_test_module_id', allModuleIds);
    if (itemErr) {
      return { ok: false, error: `item count lookup failed: ${itemErr.message}` };
    }
    for (const it of itemRows ?? []) {
      const subj = it.practice_test_module?.subject_code;
      if (subj && bySubject[subj]) bySubject[subj].totalItems += 1;
    }
  }

  // 4. score_conversion rows for this test, both sections in one
  //    query. The lookup helper filters per-section internally.
  const { data: lookupRows, error: lookupErr } = await supabase
    .from('score_conversion')
    .select('section, module1_correct, module2_correct, scaled_score')
    .eq('test_id', attempt.practice_test_id)
    .in('section', [SECTION_KEY.RW, SECTION_KEY.MATH]);
  if (lookupErr) {
    return { ok: false, error: `score_conversion lookup failed: ${lookupErr.message}` };
  }

  // 5. Compute scaled scores per section, then composite.
  const rwScaled = scaleSectionScoreWithLookup({
    subject: 'RW',
    m1Correct: bySubject.RW.m1,
    m2Correct: bySubject.RW.m2,
    totalItems: bySubject.RW.totalItems,
    route: bySubject.RW.route,
    lookupRows: lookupRows ?? [],
  });
  const mathScaled = scaleSectionScoreWithLookup({
    subject: 'MATH',
    m1Correct: bySubject.MATH.m1,
    m2Correct: bySubject.MATH.m2,
    totalItems: bySubject.MATH.totalItems,
    route: bySubject.MATH.route,
    lookupRows: lookupRows ?? [],
  });
  const composite = compositeScore({ rwScaled, mathScaled });

  // 6. Write back. finished_at only gets stamped if not already set,
  //    so an import that preserved the original v1 finished_at keeps
  //    that timestamp.
  const update = {
    status: 'completed',
    rw_scaled: rwScaled,
    math_scaled: mathScaled,
    composite_score: composite,
  };

  const { error: updateErr } = await supabase
    .from('practice_test_attempts_v2')
    .update(update)
    .eq('id', attemptId);
  if (updateErr) {
    return { ok: false, error: `update failed: ${updateErr.message}` };
  }

  return {
    ok: true,
    changed: true,
    rwScaled,
    mathScaled,
    composite,
  };
}
