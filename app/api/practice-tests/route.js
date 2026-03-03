import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { toScaledScore } from '../../../lib/scoreConversion';

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

  // For completed attempts, calculate scores from attempt_items → attempts table
  const completedIds = (attemptsRaw || [])
    .filter((a) => a.status === 'completed')
    .map((a) => a.id);

  let scoresByAttempt = {};
  if (completedIds.length > 0) {
    const { data: attemptItems } = await supabase
      .from('practice_test_attempt_items')
      .select('practice_test_attempt_id, subject_code, question_version_id')
      .in('practice_test_attempt_id', completedIds);

    if (attemptItems?.length) {
      // Get question_id for each question_version_id
      const versionIds = [...new Set(attemptItems.map((i) => i.question_version_id))];
      const { data: versions } = await supabase
        .from('question_versions')
        .select('id, question_id')
        .in('id', versionIds);

      const versionToQuestion = {};
      for (const v of versions || []) versionToQuestion[v.id] = v.question_id;

      // Get attempt results for these questions
      const questionIds = [...new Set(Object.values(versionToQuestion))];
      const { data: attemptsData } = await supabase
        .from('attempts')
        .select('question_id, is_correct')
        .eq('user_id', user.id)
        .in('question_id', questionIds);

      // Use most recent attempt per question
      const latestByQuestion = {};
      for (const a of attemptsData || []) {
        latestByQuestion[a.question_id] = a.is_correct;
      }

      // Build attempt → subject → { correct, total }
      for (const item of attemptItems) {
        const qid = versionToQuestion[item.question_version_id];
        const attemptId = item.practice_test_attempt_id;
        const subj = item.subject_code;
        if (!scoresByAttempt[attemptId]) scoresByAttempt[attemptId] = {};
        if (!scoresByAttempt[attemptId][subj]) scoresByAttempt[attemptId][subj] = { correct: 0, total: 0 };
        scoresByAttempt[attemptId][subj].total += 1;
        if (qid && latestByQuestion[qid]) scoresByAttempt[attemptId][subj].correct += 1;
      }
    }
  }

  const attempts = (attemptsRaw || []).map((a) => {
    const subjScores = scoresByAttempt[a.id] || {};
    const subjects = Object.keys(subjScores);
    let composite = null;
    const sectionScores = {};
    let totalCorrect = 0;
    let totalQuestions = 0;
    for (const subj of subjects) {
      const { correct, total } = subjScores[subj];
      const scaled = toScaledScore(correct, total);
      sectionScores[subj] = { correct, total, scaled };
      composite = (composite || 0) + scaled;
      totalCorrect += correct;
      totalQuestions += total;
    }
    return { ...a, composite, sectionScores, totalCorrect, totalQuestions };
  });

  return NextResponse.json({ tests, attempts });
}
