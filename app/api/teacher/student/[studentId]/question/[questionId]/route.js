import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/teacher/student/[studentId]/question/[questionId]
// Returns question data with the STUDENT's attempt status (read-only for teacher view)
export const GET = legacyApiRoute(async (_request, props) => {
  const params = await props.params;
  const { studentId, questionId } = params;
  const { supabase, profile } = await requireRole(['teacher', 'manager', 'admin']);

  // can_view covers admin, direct tutor->student, manager->tutor->student,
  // and class enrollments. The previous inline check missed managers.
  const { data: canView } = await supabase.rpc('can_view', { target: studentId });
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch question version
  const { data: version, error: verErr } = await supabase
    .from('question_versions')
    .select('id, question_id, question_type, stimulus_html, stem_html, rationale_html, created_at, is_current')
    .eq('question_id', questionId)
    .order('is_current', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });
  if (!version) return NextResponse.json({ error: 'Question not found.' }, { status: 404 });

  // Parallel queries for question data + student's status
  const [optResult, taxResult, qRowResult, stResult, caResult, lastAttemptResult] = await Promise.all([
    supabase
      .from('answer_options')
      .select('id, ordinal, label, content_html')
      .eq('question_version_id', version.id)
      .order('ordinal', { ascending: true }),
    supabase
      .from('question_taxonomy')
      .select('question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
      .eq('question_id', questionId)
      .maybeSingle(),
    supabase
      .from('questions')
      .select('source_external_id, is_broken')
      .eq('id', questionId)
      .maybeSingle(),
    // Student's status (not the teacher's)
    supabase
      .from('question_status')
      .select('user_id, question_id, is_done, marked_for_review, attempts_count, correct_attempts_count, last_attempt_at, last_is_correct, status_json, notes')
      .eq('user_id', studentId)
      .eq('question_id', questionId)
      .maybeSingle(),
    supabase
      .from('correct_answers')
      .select('correct_option_id, correct_text')
      .eq('question_version_id', version.id)
      .limit(1)
      .maybeSingle(),
    // Student's first attempt for this question (source of truth for scoring)
    supabase
      .from('attempts')
      .select('selected_option_id, response_text, is_correct, created_at')
      .eq('user_id', studentId)
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const { data: options, error: optErr } = optResult;
  if (optErr) return NextResponse.json({ error: optErr.message }, { status: 400 });

  const { data: taxonomy } = taxResult;
  const { data: questionRow } = qRowResult;
  const { data: st } = stResult;
  const { data: ca } = caResult;
  const { data: firstAttempt } = lastAttemptResult;

  // Build student status with first attempt answer (source of truth for scoring)
  let status = null;
  if (st) {
    const prevJson = st.status_json && typeof st.status_json === 'object' ? st.status_json : {};
    if (firstAttempt) {
      if (version.question_type === 'mcq' && !prevJson.last_selected_option_id) {
        prevJson.last_selected_option_id = firstAttempt.selected_option_id;
      }
      if (version.question_type === 'spr' && !prevJson.last_response_text) {
        prevJson.last_response_text = firstAttempt.response_text;
      }
    }
    status = { ...st, status_json: prevJson };
  }

  // Always reveal correct answer in teacher review mode
  let correct_option_id = null;
  let correct_text = null;
  if (version.question_type === 'mcq') correct_option_id = ca?.correct_option_id ?? null;
  if (version.question_type === 'spr') correct_text = ca?.correct_text ?? null;

  return NextResponse.json({
    question_id: questionId,
    source_external_id: questionRow?.source_external_id ?? null,
    is_broken: questionRow?.is_broken ?? false,
    version,
    options: options ?? [],
    taxonomy,
    status,
    correct_option_id,
    correct_text,
    student_attempt: firstAttempt || null,
    viewer_role: profile.role,
  });
});
