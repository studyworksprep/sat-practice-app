import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { parseBluebookReport, BluebookParseError } from '@/lib/bluebook/parse-report';
import { chooseModule2Route } from '@/lib/practice-test/adaptive-routing';
import { isHardRoute } from '../../../../../../lib/scoreConversion';

// POST /api/teacher/student/[studentId]/upload-bluebook
// Body: {
//   practice_test_id,        — UUID of the practice test to associate with
//   rw_score,                — user-entered scaled RW score (200-800)
//   math_score,              — user-entered scaled Math score (200-800)
//   test_date,               — optional; falls back to the report's own date
//   html,                    — optional raw Bluebook "Details" export
// }
//
// The body used to carry `questions` + `correctCounts`: each client
// parsed the .htm in the browser and this route stored the result
// verbatim, so a hand-edited payload was indistinguishable from a real
// report. The raw HTML now comes over the wire and is parsed here
// (docs/bluebook-contributions-plan-2026-08.md, decision 6). Clients
// still preview via POST /api/bluebook/parse, but the preview is a
// courtesy — what gets stored is what this route parsed.
//
// Writes v2-native: practice_test_attempts_v2 (+ module_attempts_v2
// + item_attempts_v2) plus the shared attempts rows. The legacy v1
// dual-write + mirror that pre-dated the v2 attempt-family tables
// is gone — every reader of the v1 tables now reads _v2, and the
// v2 columns (source, uploaded_by, sections_only) carry what the
// old metadata jsonb did.
//
// Creates:
//  1. practice_test_attempts_v2 (completed), stamped with the
//     official_source / officialized_at provenance columns
//  2. practice_test_module_attempts_v2 per submitted module
//  3. attempts + practice_test_item_attempts_v2 per question
//  4. score_conversion entries (if both per-section counts provided),
//     each carrying attempt_id so the curve row's origin is explicit
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
  const { practice_test_id, rw_score, math_score, test_date, html } = body;

  if (!practice_test_id) {
    return NextResponse.json({ error: 'practice_test_id is required' }, { status: 400 });
  }

  // Parse here, not in the browser. A parse failure is the uploader's
  // problem to fix (wrong file, new format), so it's a 400 with the
  // parser's own diagnostic rather than a 500.
  let parsed = null;
  if (typeof html === 'string' && html.trim()) {
    try {
      parsed = parseBluebookReport(html);
    } catch (err) {
      if (err instanceof BluebookParseError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }
  const questions = parsed?.questions ?? null;
  const correctCounts = parsed?.correctCounts ?? null;

  const rwScaled = parseInt(rw_score, 10) || null;
  const mathScaled = parseInt(math_score, 10) || null;
  const composite = (rwScaled || 0) + (mathScaled || 0);

  // An attempt is "official" when a human transcribed real Bluebook
  // scaled scores onto it. Without a scaled score there is nothing
  // official to record, and the attempt stays an estimate
  // (official_source NULL) — see the provenance columns added
  // 2026-08-05. Distinct from `source`, which records where the ROW came
  // from rather than where its SCORES came from.
  const isOfficial = Boolean(rwScaled || mathScaled);
  const officialSource = isOfficial ? 'bluebook_upload' : null;
  const officializedAt = isOfficial ? new Date().toISOString() : null;

  // Verify the practice test exists
  const { data: test, error: testErr } = await service
    .from('practice_tests_v2')
    .select('id, name, code, rw_route_threshold, math_route_threshold')
    .eq('id', practice_test_id)
    .maybeSingle();

  if (testErr || !test) {
    return NextResponse.json({ error: 'Practice test not found' }, { status: 404 });
  }

  // ── Score-only mode (no Bluebook HTML uploaded) ──
  // Creates only the attempt row for statistical tracking. No
  // module attempts, item attempts, or score_conversion entries.
  if (!questions?.length) {
    const now = attemptTimestamp(test_date, parsed);

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
        official_source: officialSource,
        officialized_at: officializedAt,
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
    .from('practice_test_modules_v2')
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

  // Which DB module row a parsed module maps to. Module 2 exists twice
  // (easy/hard), and picking the wrong one attaches the report's answers
  // to the wrong questions.
  //
  // This used to hard-code thresholds of 18 (RW) and 14 (Math). Real
  // per-test thresholds live on practice_tests_v2 and range 16-19 / 14-16
  // in production, so the constant mis-routed uploads for every test that
  // wasn't 18/14. It now asks chooseModule2Route — the same function the
  // live runner routes students with — so an upload lands on the module
  // the student would actually have been served.
  function findModule(subjectCode, moduleNum) {
    const candidates = (allModules || []).filter(
      m => m.subject_code === subjectCode && m.module_number === moduleNum
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) return null;

    if (moduleNum === 2) {
      const route = chooseModule2Route({
        subject: subjectCode,
        module1CorrectCount: subjectCode === 'RW' ? rwM1Correct : mathM1Correct,
        threshold: subjectCode === 'RW' ? test.rw_route_threshold : test.math_route_threshold,
      });
      const hardCandidate = candidates.find(c => isHardRoute(c.route_code));
      const easyCandidate = candidates.find(c => !isHardRoute(c.route_code));
      return (route === 'hard' ? hardCandidate : easyCandidate) || candidates[0];
    }
    return candidates[0];
  }

  const now = attemptTimestamp(test_date, parsed);

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
      official_source: officialSource,
      officialized_at: officializedAt,
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
  // attempt_id is the whole provenance story for a curve row: it says
  // this (m1, m2) -> scaled mapping came from a specific transcribed
  // report, not from the estimator. Before 2026-08-05 it went unset and
  // had to be reconstructed forensically from Postgres xmin adjacency —
  // which worked once and must never be relied on again.
  if (rwScaled && correctCounts.rw) {
    await service.from('score_conversion').upsert({
      test_id: practice_test_id,
      test_name: test.name || '',
      section: 'reading_writing',
      module1_correct: correctCounts.rw.m1,
      module2_correct: correctCounts.rw.m2,
      scaled_score: rwScaled,
      attempt_id: attempt.id,
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
      attempt_id: attempt.id,
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

// When the test was taken. An explicit test_date wins; otherwise fall
// back to the date printed in the report itself, which is more accurate
// than "whenever the tutor got around to uploading". Noon UTC keeps the
// calendar date stable either side of the date line.
function attemptTimestamp(testDate, parsed) {
  const day = testDate || parsed?.reportDate;
  return day ? new Date(day + 'T12:00:00Z').toISOString() : new Date().toISOString();
}
