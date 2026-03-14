import { computeScaledScore } from './scoreConversion';

const subjToSection = {
  RW: 'reading_writing', rw: 'reading_writing',
  M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
};

/**
 * Compute test scores for completed practice test attempts.
 * Uses cached scores from practice_test_attempts when available,
 * falling back to full computation from module data + score_conversion.
 *
 * @param {Object} supabase - Supabase client
 * @param {Array} completedAttempts - Array of practice_test_attempt rows
 * @returns {Array} Array of { attempt_id, test_name, finished_at, composite, sections }
 */
export async function computeTestScores(supabase, completedAttempts) {
  if (!completedAttempts?.length) return [];

  // Split into cached (already have scores) and uncached
  const cached = [];
  const uncached = [];
  for (const a of completedAttempts) {
    if (a.composite_score != null) {
      cached.push(a);
    } else {
      uncached.push(a);
    }
  }

  // Build results from cached attempts (no DB queries needed)
  const testIds = [...new Set(completedAttempts.map(a => a.practice_test_id))];
  const { data: tests } = await supabase.from('practice_tests').select('id, name').in('id', testIds);
  const testNameById = {};
  for (const t of tests || []) testNameById[t.id] = t.name;

  const cachedResults = cached.map(a => ({
    attempt_id: a.id,
    test_name: testNameById[a.practice_test_id] || 'Practice Test',
    finished_at: a.finished_at,
    composite: a.composite_score,
    sections: {
      ...(a.rw_scaled != null ? { RW: { scaled: a.rw_scaled } } : {}),
      ...(a.math_scaled != null ? { M: { scaled: a.math_scaled } } : {}),
    },
  }));

  if (uncached.length === 0) return reorder(completedAttempts, cachedResults);

  // Full computation for uncached attempts
  const uncachedTestIds = [...new Set(uncached.map(a => a.practice_test_id))];
  const attemptIds = uncached.map(a => a.id);

  const [{ data: moduleAttempts }, { data: lookupRows }] = await Promise.all([
    supabase
      .from('practice_test_module_attempts')
      .select('practice_test_attempt_id, practice_test_module_id, correct_count')
      .in('practice_test_attempt_id', attemptIds),
    supabase
      .from('score_conversion')
      .select('test_id, section, module1_correct, module2_correct, scaled_score')
      .in('test_id', uncachedTestIds),
  ]);

  const modIds = [...new Set((moduleAttempts || []).map(ma => ma.practice_test_module_id))];
  const { data: mods } = modIds.length
    ? await supabase.from('practice_test_modules').select('id, subject_code, module_number, route_code').in('id', modIds)
    : { data: [] };

  const modById = {};
  for (const m of mods || []) modById[m.id] = m;

  const lookupByTestSection = {};
  for (const row of lookupRows || []) {
    const key = `${row.test_id}/${row.section}`;
    if (!lookupByTestSection[key]) lookupByTestSection[key] = [];
    lookupByTestSection[key].push(row);
  }

  const maByPta = {};
  for (const ma of moduleAttempts || []) {
    const mod = modById[ma.practice_test_module_id];
    if (!mod) continue;
    if (!maByPta[ma.practice_test_attempt_id]) maByPta[ma.practice_test_attempt_id] = {};
    maByPta[ma.practice_test_attempt_id][`${mod.subject_code}/${mod.module_number}`] = {
      correct: ma.correct_count || 0,
      routeCode: mod.route_code,
      subjectCode: mod.subject_code,
    };
  }

  const uncachedResults = uncached.map(a => {
    const modData = maByPta[a.id] || {};
    const subjects = [...new Set(Object.values(modData).map(d => d.subjectCode))];
    const sections = {};
    let composite = null;

    for (const subj of subjects) {
      const m1 = modData[`${subj}/1`] || { correct: 0 };
      const m2 = modData[`${subj}/2`] || { correct: 0, routeCode: null };
      const sectionName = subjToSection[subj] || 'math';
      const lookupKey = `${a.practice_test_id}/${sectionName}`;

      const scaled = computeScaledScore({
        section: sectionName,
        m1Correct: m1.correct,
        m2Correct: m2.correct,
        routeCode: m2.routeCode,
        lookupRows: lookupByTestSection[lookupKey] || [],
      });

      sections[subj] = { scaled };
      composite = (composite || 0) + scaled;
    }

    // Cache the computed scores for next time (fire and forget)
    if (composite != null) {
      const rwScaled = sections['RW']?.scaled || sections['rw']?.scaled || null;
      const mathScaled = sections['M']?.scaled || sections['m']?.scaled || sections['MATH']?.scaled || null;
      supabase
        .from('practice_test_attempts')
        .update({ composite_score: composite, rw_scaled: rwScaled, math_scaled: mathScaled })
        .eq('id', a.id)
        .then(() => {});
    }

    return {
      attempt_id: a.id,
      test_name: testNameById[a.practice_test_id] || 'Practice Test',
      finished_at: a.finished_at,
      composite,
      sections,
    };
  });

  return reorder(completedAttempts, [...cachedResults, ...uncachedResults]);
}

// Maintain original order from completedAttempts
function reorder(completedAttempts, results) {
  const byId = {};
  for (const r of results) byId[r.attempt_id] = r;
  return completedAttempts.map(a => byId[a.id]).filter(Boolean);
}
