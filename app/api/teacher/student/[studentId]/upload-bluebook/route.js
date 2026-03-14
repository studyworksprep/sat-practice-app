import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';
import { createServiceClient } from '../../../../../../lib/supabase/server';
import { computeScaledScore, isHardRoute } from '../../../../../../lib/scoreConversion';

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
// Creates:
//  1. practice_test_attempt (completed)
//  2. practice_test_module_attempts
//  3. attempts + practice_test_item_attempts for each question
//  4. Score conversion data entries (if scores provided)
export async function POST(request, { params }) {
  const { studentId } = params;
  const supabase = createClient();
  const service = createServiceClient();

  // Authenticate the caller
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify caller is teacher or admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'teacher' && profile?.role !== 'manager' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // For teachers, verify they can view this student
  if (profile.role === 'teacher' || profile.role === 'manager') {
    const { data: canView } = await supabase.rpc('teacher_can_view_student', {
      target_student_id: studentId,
    });
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden: student not in your roster' }, { status: 403 });
    }
  }

  const body = await request.json();
  const { practice_test_id, rw_score, math_score, test_date, questions, correctCounts } = body;

  if (!practice_test_id) {
    return NextResponse.json({ error: 'practice_test_id is required' }, { status: 400 });
  }
  if (!questions?.length) {
    return NextResponse.json({ error: 'No questions provided. The Bluebook HTML file may not have been parsed successfully.' }, { status: 400 });
  }
  if (!correctCounts) {
    return NextResponse.json({ error: 'correctCounts is required' }, { status: 400 });
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

  // Build submitted_modules metadata
  const submittedModuleKeys = Object.keys(subjectModules);
  const metaRoutes = {};
  for (const key of submittedModuleKeys) {
    const sm = subjectModules[key];
    if (sm.moduleNumber === 2) {
      const mod = findModule(sm.subjectCode, 2);
      if (mod) {
        const routeField = sm.subjectCode === 'RW' ? 'rw_route_code' : 'm_route_code';
        metaRoutes[routeField] = mod.route_code;
      }
    }
  }

  // 1. Create the practice_test_attempt
  const { data: attempt, error: attemptErr } = await service
    .from('practice_test_attempts')
    .insert({
      practice_test_id,
      user_id: studentId,
      status: 'completed',
      started_at: now,
      finished_at: now,
      composite_score: composite || null,
      rw_scaled: rwScaled,
      math_scaled: mathScaled,
      metadata: {
        submitted_modules: submittedModuleKeys,
        ...metaRoutes,
        uploaded_by: user.id,
        upload_source: 'bluebook',
      },
    })
    .select('id')
    .single();

  if (attemptErr) {
    return NextResponse.json({ error: `Failed to create attempt: ${attemptErr.message}` }, { status: 500 });
  }

  // 2. For each subject/module group, create module attempts and item attempts
  for (const [key, sm] of Object.entries(subjectModules)) {
    const moduleRow = findModule(sm.subjectCode, sm.moduleNumber);
    if (!moduleRow) continue;

    // Get module items to link questions
    const { data: moduleItems } = await service
      .from('practice_test_module_items')
      .select('id, ordinal, question_version_id')
      .eq('practice_test_module_id', moduleRow.id)
      .order('ordinal', { ascending: true });

    // Get question versions for these items
    const versionIds = (moduleItems || []).map(i => i.question_version_id);
    const { data: versions } = versionIds.length
      ? await service.from('question_versions').select('id, question_id').in('id', versionIds)
      : { data: [] };

    const versionToQid = {};
    for (const v of versions || []) versionToQid[v.id] = v.question_id;

    // Get correct answers for grading
    const { data: correctAnswers } = versionIds.length
      ? await service
          .from('correct_answers')
          .select('question_version_id, answer_type, correct_option_id, correct_text, correct_number, numeric_tolerance')
          .in('question_version_id', versionIds)
      : { data: [] };

    const correctByVersion = {};
    for (const ca of correctAnswers || []) correctByVersion[ca.question_version_id] = ca;

    // Get answer options for MCQ matching
    const { data: answerOptions } = versionIds.length
      ? await service
          .from('answer_options')
          .select('id, question_version_id, label')
          .in('question_version_id', versionIds)
      : { data: [] };

    const optionsByVersion = {};
    for (const o of answerOptions || []) {
      if (!optionsByVersion[o.question_version_id]) optionsByVersion[o.question_version_id] = [];
      optionsByVersion[o.question_version_id].push(o);
    }

    let correctCount = 0;
    const versionToAttemptId = {};

    // Match parsed questions to module items by ordinal
    for (const item of moduleItems || []) {
      const parsed = sm.questions.find(q => q.ordinal === item.ordinal);
      const questionId = versionToQid[item.question_version_id];
      if (!questionId) continue;

      // Determine correctness: use the parsed isCorrect from Bluebook
      const isCorrect = parsed?.isCorrect || false;
      if (isCorrect) correctCount += 1;

      // Build the attempt record
      let selectedOptionId = null;
      let responseText = null;

      if (parsed) {
        if (parsed.questionType === 'mcq') {
          // Match the student's letter answer (A/B/C/D) to an option id
          const options = optionsByVersion[item.question_version_id] || [];
          const matchedOption = options.find(o =>
            o.label?.toUpperCase() === parsed.studentAnswer?.toUpperCase()
          );
          selectedOptionId = matchedOption?.id || null;

          // Fallback: if no label match, try matching by ordinal (A=1, B=2, etc.)
          if (!selectedOptionId && parsed.studentAnswer) {
            const letterIndex = parsed.studentAnswer.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
            const byOrdinal = options.find(o => o.ordinal === letterIndex + 1);
            selectedOptionId = byOrdinal?.id || null;
          }
        } else {
          // SPR: store the numeric/text response
          responseText = parsed.studentAnswer || null;
        }
      }

      const { data: attemptRow } = await service
        .from('attempts')
        .insert({
          user_id: studentId,
          question_id: questionId,
          is_correct: isCorrect,
          selected_option_id: selectedOptionId,
          response_text: responseText,
          created_at: now,
          source: 'practice_test',
        })
        .select('id')
        .single();

      if (attemptRow?.id) versionToAttemptId[item.question_version_id] = attemptRow.id;
    }

    // Create practice_test_module_attempts
    const { data: moduleAttemptRow, error: maErr } = await service
      .from('practice_test_module_attempts')
      .insert({
        practice_test_attempt_id: attempt.id,
        practice_test_module_id: moduleRow.id,
        started_at: now,
        finished_at: now,
        correct_count: correctCount,
        raw_score: correctCount,
        metadata: { upload_source: 'bluebook' },
      })
      .select('id')
      .single();

    if (maErr) continue;

    // Create practice_test_item_attempts
    const itemAttemptRows = (moduleItems || [])
      .filter(item => versionToAttemptId[item.question_version_id])
      .map(item => ({
        practice_test_module_attempt_id: moduleAttemptRow.id,
        practice_test_module_item_id: item.id,
        attempt_id: versionToAttemptId[item.question_version_id],
      }));

    if (itemAttemptRows.length > 0) {
      await service.from('practice_test_item_attempts').insert(itemAttemptRows);
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
}
