import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { isHardRoute } from '../../../../../../lib/scoreConversion';

// POST /api/teacher/student/[studentId]/upload-bluebook
// Body: {
//   practice_test_id,        — UUID of the practice test to associate with
//   rw_score,                — user-entered scaled RW score (200-800)
//   math_score,              — user-entered scaled Math score (200-800)
//   questions: [{            — parsed question data from Bluebook HTML
//     ordinal, subjectCode, moduleNumber, correctAnswer,
//     studentAnswer, isCorrect, domain, questionType
//   }],
//   correctCounts: { rw: { m1, m2, total }, math: { m1, m2, total } }
// }
//
// Writes v2-native: practice_test_attempts_v2 (+ module_attempts_v2
// + item_attempts_v2) plus the shared attempts rows. The legacy v1
// dual-write + mirror that pre-dated the v2 attempt-family tables
// is gone — every reader of the v1 tables now reads _v2, and the
// v2 columns (source, uploaded_by, sections_only) carry what the
// old metadata jsonb did.
//
// Creates:
//  1. practice_test_attempts_v2 (completed)
//  2. practice_test_module_attempts_v2 per submitted module
//  3. attempts + practice_test_item_attempts_v2 per question
//  4. score_conversion entries (if both per-section counts provided)
export const POST = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const { studentId } = params;
  const { supabase, user, service } = await requireServiceRole(
    'teacher uploads Bluebook practice test for student',
    { allowedRoles: ['teacher', 'manager', 'admin'] },
  );

  // can_view covers admin, direct tutor->student, manager->tutor->student,
  // and class enrollments. teacher_can_view_student misses the manager paths.
  const { data: canView } = await supabase.rpc('can_view', { target: studentId });
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden: student not in your roster' }, { status: 403 });
  }

  const body = await request.json();
  const { practice_test_id, rw_score, math_score, test_date, questions, correctCounts } = body;

  if (!practice_test_id) {
    return NextResponse.json({ error: 'practice_test_id is required' }, { status: 400 });
  }

  const rwScaled = parseInt(rw_score, 10) || null;
  const mathScaled = parseInt(math_score, 10) || null;
  const composite = (rwScaled || 0) + (mathScaled || 0);

  // Verify the practice test exists
  const { data: test, error: testErr } = await service
    .from('practice_tests')
    .select('id, name, code')
    .eq('id', practice_test_id)
    .maybeSingle();

  if (testErr || !test) {
    return NextResponse.json({ error: 'Practice test not found' }, { status: 404 });
  }

  // ── Score-only mode (no Bluebook HTML uploaded) ──
  // Creates only the attempt row for statistical tracking. No
  // module attempts, item attempts, or score_conversion entries.
  if (!questions?.length) {
    const now = test_date ? new Date(test_date + 'T12:00:00Z').toISOString() : new Date().toISOString();

    const { data: attempt, error: attemptErr } = await service
      .from('practice_test_attempts_v2')
      .insert({
        practice_test_id,
        user_id: studentId,
        status: 'completed',
        source: 'bluebook_upload',
        uploaded_by: user.id,
        started_at: now,
        finished_at: now,
        composite_score: composite || null,
        rw_scaled: rwScaled,
        math_scaled: mathScaled,
      })
      .select('id')
      .single();

    if (attemptErr) {
      return NextResponse.json({ error: `Failed to create attempt: ${attemptErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      attempt_id: attempt.id,
      composite_score: composite,
      rw_scaled: rwScaled,
      math_scaled: mathScaled,
      questions_imported: 0,
    });
  }

  if (!correctCounts) {
    return NextResponse.json({ error: 'correctCounts is required' }, { status: 400 });
  }

  // Fetch all modules for this practice test
  const { data: allModules } = await service
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', practice_test_id)
    .order('subject_code')
    .order('module_number');

  // Determine which modules were used (from parsed data)
  const subjectModules = {};
  for (const q of questions) {
    const key = `${q.subjectCode}/${q.moduleNumber}`;
    if (!subjectModules[key]) {
      subjectModules[key] = { subjectCode: q.subjectCode, moduleNumber: q.moduleNumber, questions: [] };
    }
    subjectModules[key].questions.push(q);
  }

  // Determine module-1 correct counts for routing
  const rwM1Correct = correctCounts.rw?.m1 || 0;
  const mathM1Correct = correctCounts.math?.m1 || 0;

  // Try to match modules from the DB — for module 2, we need to figure out routing
  // If we can't match exactly, pick first available module
  function findModule(subjectCode, moduleNum) {
    const candidates = (allModules || []).filter(
      m => m.subject_code === subjectCode && m.module_number === moduleNum
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) return null;

    // Multiple module-2 variants (easy/hard routing) — try to determine from routing rules
    // For uploaded tests, we'll pick based on the M1 correct count
    if (moduleNum === 2) {
      // Fetch routing rules to determine which route was taken
      // For now, use a heuristic: more M1 correct → "hard" route
      // This matches the piecewiseFallback logic in scoreConversion.js
      const threshold = subjectCode === 'RW' ? 18 : 14;
      const m1Correct = subjectCode === 'RW' ? rwM1Correct : mathM1Correct;
      const isHard = m1Correct >= threshold;

      // Match hard/easy route based on route_code values (exact match: "hard"/"h"/"2" vs "easy"/"e"/"1")
      const hardCandidate = candidates.find(c => isHardRoute(c.route_code));
      const easyCandidate = candidates.find(c => !isHardRoute(c.route_code));
      return (isHard ? hardCandidate : easyCandidate) || candidates[0];
    }
    return candidates[0];
  }

  const now = test_date ? new Date(test_date + 'T12:00:00Z').toISOString() : new Date().toISOString();

  // 1. Create the practice_test_attempts_v2 row. The "which modules
  // were submitted" / "which route per module" data the old v1
  // metadata jsonb held is now implicit in the v2 module_attempts
  // rows below (route_code on each module is the route taken).
  const { data: attempt, error: attemptErr } = await service
    .from('practice_test_attempts_v2')
    .insert({
      practice_test_id,
      user_id: studentId,
      status: 'completed',
      source: 'bluebook_upload',
      uploaded_by: user.id,
      started_at: now,
      finished_at: now,
      composite_score: composite || null,
      rw_scaled: rwScaled,
      math_scaled: mathScaled,
    })
    .select('id')
    .single();

  if (attemptErr) {
    return NextResponse.json({ error: `Failed to create attempt: ${attemptErr.message}` }, { status: 500 });
  }

  // 2. For each subject/module group, create module attempts and item attempts
  for (const sm of Object.values(subjectModules)) {
    const moduleRow = findModule(sm.subjectCode, sm.moduleNumber);
    if (!moduleRow) continue;

    // _v2 module items expose question_id (v2) directly — no v1
    // question_versions hop needed for the per-attempt write below.
    const { data: moduleItems } = await service
      .from('practice_test_module_items_v2')
      .select('id, ordinal, question_id')
      .eq('practice_test_module_id', moduleRow.id)
      .order('ordinal', { ascending: true });

    let correctCount = 0;
    const itemIdToAttemptId = {};

    // Match parsed questions to module items by ordinal
    for (const item of moduleItems || []) {
      const parsed = sm.questions.find(q => q.ordinal === item.ordinal);
      const questionId = item.question_id;
      if (!questionId) continue;

      const isCorrect = parsed?.isCorrect || false;
      if (isCorrect) correctCount += 1;

      // v2 contract for attempts: response_text holds the student's answer
      // (letter for MCQ, numeric/text for SPR); selected_option_id is a
      // legacy v1 column that every other v2 write path leaves null and
      // load-test-results already translates for historical rows.
      const responseText = parsed?.studentAnswer ?? null;

      const { data: attemptRow } = await service
        .from('attempts')
        .insert({
          user_id: studentId,
          question_id: questionId,
          is_correct: isCorrect,
          selected_option_id: null,
          response_text: responseText,
          created_at: now,
          source: 'practice_test',
        })
        .select('id')
        .single();

      if (attemptRow?.id) itemIdToAttemptId[item.id] = attemptRow.id;
    }

    // Create practice_test_module_attempts_v2
    const { data: moduleAttemptRow, error: maErr } = await service
      .from('practice_test_module_attempts_v2')
      .insert({
        practice_test_attempt_id: attempt.id,
        practice_test_module_id: moduleRow.id,
        started_at: now,
        finished_at: now,
        correct_count: correctCount,
        raw_score: correctCount,
      })
      .select('id')
      .single();

    if (maErr) continue;

    // Create practice_test_item_attempts_v2
    const itemAttemptRows = (moduleItems || [])
      .filter(item => itemIdToAttemptId[item.id])
      .map(item => ({
        practice_test_module_attempt_id: moduleAttemptRow.id,
        practice_test_module_item_id: item.id,
        attempt_id: itemIdToAttemptId[item.id],
        marked_for_review: false,
      }));

    if (itemAttemptRows.length > 0) {
      await service.from('practice_test_item_attempts_v2').insert(itemAttemptRows);
    }
  }

  // 3. Create score_conversion entries if scaled scores were provided
  if (rwScaled && correctCounts.rw) {
    await service.from('score_conversion').upsert({
      test_id: practice_test_id,
      test_name: test.name || '',
      section: 'reading_writing',
      module1_correct: correctCounts.rw.m1,
      module2_correct: correctCounts.rw.m2,
      scaled_score: rwScaled,
    }, { onConflict: 'test_id,section,module1_correct,module2_correct' });
  }

  if (mathScaled && correctCounts.math) {
    await service.from('score_conversion').upsert({
      test_id: practice_test_id,
      test_name: test.name || '',
      section: 'math',
      module1_correct: correctCounts.math.m1,
      module2_correct: correctCounts.math.m2,
      scaled_score: mathScaled,
    }, { onConflict: 'test_id,section,module1_correct,module2_correct' });
  }

  return NextResponse.json({
    attempt_id: attempt.id,
    composite_score: composite,
    rw_scaled: rwScaled,
    math_scaled: mathScaled,
    questions_imported: questions.length,
  });
});
