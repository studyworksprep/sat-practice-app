import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { computeScaledScore, toScaledScore } from '../../../lib/scoreConversion';

// GET /api/practice-tests
// Returns { tests, attempts } for the current user.
//   tests   — all published practice tests with question counts
//   attempts — user's attempts newest-first, with scores for completed ones
export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Published tests
  const { data: testsRaw, error: testsErr } = await supabase
    .from('practice_tests')
    .select('id, code, name, is_adaptive, created_at')
    .eq('is_published', true)
    .order('created_at', { ascending: true });

  if (testsErr) return NextResponse.json({ error: testsErr.message }, { status: 400 });

  // Question counts per test: aggregate through modules → module_items
  const { data: modulesRaw } = await supabase
    .from('practice_test_modules')
    .select('id, practice_test_id, subject_code, module_number, route_code, time_limit_seconds');

  const { data: moduleItemsRaw } = await supabase
    .from('practice_test_module_items')
    .select('practice_test_module_id');

  // Build per-test question count (module 1 only, deduplicated by question position)
  const itemsByModule = {};
  for (const item of moduleItemsRaw || []) {
    itemsByModule[item.practice_test_module_id] =
      (itemsByModule[item.practice_test_module_id] || 0) + 1;
  }

  const modulesByTest = {};
  for (const mod of modulesRaw || []) {
    if (!modulesByTest[mod.practice_test_id]) modulesByTest[mod.practice_test_id] = [];
    modulesByTest[mod.practice_test_id].push({
      ...mod,
      question_count: itemsByModule[mod.id] || 0,
    });
  }

  const tests = (testsRaw || []).map((t) => {
    const mods = modulesByTest[t.id] || [];
    // Total questions = sum of module 1 question counts (all subjects)
    // Module 2s have the same count but are alternative routes, don't double-count
    const m1Modules = mods.filter((m) => m.module_number === 1);
    const totalQuestions = mods.reduce((s, m) => s + m.question_count, 0);
    const m1Questions = m1Modules.reduce((s, m) => s + m.question_count, 0);
    const subjects = [...new Set(mods.map((m) => m.subject_code))];
    return { ...t, totalQuestions, m1Questions, subjects, modules: mods };
  });

  // User's attempts
  const { data: attemptsRaw, error: attErr } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, status, metadata, started_at, finished_at')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false });

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 400 });

  // For completed attempts, calculate scores from module attempts (which store correct_count per module)
  const completedAttempts = (attemptsRaw || []).filter((a) => a.status === 'completed');
  const completedIds = completedAttempts.map((a) => a.id);

  // Map subject codes to score_conversion section names
  const subjToSection = {
    RW: 'reading_writing', rw: 'reading_writing',
    M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
  };

  // Fetch module attempts (has correct_count per module) and score_conversion data
  let moduleAttemptsByPta = {};
  let lookupByTestSection = {};

  if (completedIds.length > 0) {
    const { data: moduleAttempts } = await supabase
      .from('practice_test_module_attempts')
      .select('practice_test_attempt_id, practice_test_module_id, correct_count')
      .in('practice_test_attempt_id', completedIds);

    // Map module IDs to their subject/module_number info
    const maModuleIds = [...new Set((moduleAttempts || []).map((ma) => ma.practice_test_module_id))];
    const relevantMods = (modulesRaw || []).filter((m) => maModuleIds.includes(m.id));
    const modById = {};
    for (const m of relevantMods) modById[m.id] = m;

    // Group by practice_test_attempt_id → subject → module_number
    for (const ma of moduleAttempts || []) {
      const mod = modById[ma.practice_test_module_id];
      if (!mod) continue;
      if (!moduleAttemptsByPta[ma.practice_test_attempt_id]) moduleAttemptsByPta[ma.practice_test_attempt_id] = {};
      const key = `${mod.subject_code}/${mod.module_number}`;
      moduleAttemptsByPta[ma.practice_test_attempt_id][key] = {
        correct: ma.correct_count || 0,
        routeCode: mod.route_code,
        subjectCode: mod.subject_code,
        moduleNumber: mod.module_number,
      };
    }

    // Fetch score_conversion rows for relevant tests
    const testIds = [...new Set(completedAttempts.map((a) => a.practice_test_id))];
    const { data: lookupRows } = await supabase
      .from('score_conversion')
      .select('test_id, section, module1_correct, module2_correct, scaled_score')
      .in('test_id', testIds);

    for (const row of lookupRows || []) {
      const key = `${row.test_id}/${row.section}`;
      if (!lookupByTestSection[key]) lookupByTestSection[key] = [];
      lookupByTestSection[key].push(row);
    }
  }

  const attempts = (attemptsRaw || []).map((a) => {
    const modData = moduleAttemptsByPta[a.id] || {};
    const subjects = [...new Set(Object.values(modData).map((d) => d.subjectCode))];
    let composite = null;
    const sectionScores = {};
    let totalCorrect = 0;
    let totalQuestions = 0;

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

      const correct = m1.correct + m2.correct;
      const total = (modData[`${subj}/1`]?.total || m1.correct) + (modData[`${subj}/2`]?.total || m2.correct);
      sectionScores[subj] = { correct, total, scaled };
      composite = (composite || 0) + scaled;
      totalCorrect += correct;
      totalQuestions += total;
    }
    return { ...a, composite, sectionScores, totalCorrect, totalQuestions };
  });

  return NextResponse.json({ tests, attempts });
}
