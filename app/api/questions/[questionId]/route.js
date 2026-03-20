import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/questions/:questionId
export async function GET(_request, { params }) {
  const questionId = params.questionId;
  const { searchParams } = new URL(_request.url);
  const viewAsStudentId = searchParams.get('view_as') || null;
  const supabase = createClient();

  // 1) Auth + version fetch in parallel (independent of each other)
  // Fetch both current and newest version in one query (prefer is_current=true)
  const [authResult, versionsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from('question_versions')
      .select('id, question_id, question_type, stimulus_html, stem_html, rationale_html, created_at, is_current')
      .eq('question_id', questionId)
      .order('is_current', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const user = authResult.data?.user ?? null;

  const { data: version, error: verErr } = versionsResult;
  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });

  if (!version) {
    return NextResponse.json(
      { error: 'No question_versions found for this question.' },
      { status: 404 }
    );
  }

  // Run all independent queries in parallel (all depend on version.id or questionId, which we have)
  const parallelQueries = [
    // 0: options
    supabase
      .from('answer_options')
      .select('id, ordinal, label, content_html')
      .eq('question_version_id', version.id)
      .order('ordinal', { ascending: true }),
    // 1: taxonomy
    supabase
      .from('question_taxonomy')
      .select('question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
      .eq('question_id', questionId)
      .maybeSingle(),
    // 2: questions table (source_external_id, is_broken, broken_by, broken_at)
    supabase
      .from('questions')
      .select('source_external_id, is_broken, broken_by, broken_at')
      .eq('id', questionId)
      .maybeSingle(),
    // 3: status (per user, or view_as student) — null placeholder if no user
    user
      ? supabase
          .from('question_status')
          .select('user_id, question_id, is_done, marked_for_review, attempts_count, correct_attempts_count, last_attempt_at, last_is_correct, status_json, notes')
          .eq('user_id', viewAsStudentId || user.id)
          .eq('question_id', questionId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // 4: correct answer (always fetch; gated in response building below)
    supabase
      .from('correct_answers')
      .select('correct_option_id, correct_text')
      .eq('question_version_id', version.id)
      .limit(1)
      .maybeSingle(),
    // 5: user profile/role
    user
      ? supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ];

  const [optResult, taxResult, qRowResult, stResult, caResult, profileResult] = await Promise.all(parallelQueries);

  const { data: options, error: optErr } = optResult;
  if (optErr) return NextResponse.json({ error: optErr.message }, { status: 400 });

  const { data: taxonomy, error: taxErr } = taxResult;
  if (taxErr) return NextResponse.json({ error: taxErr.message }, { status: 400 });

  let questionRow = qRowResult.data;

  // If the query failed (e.g. broken_by/broken_at columns not yet migrated),
  // retry without the audit columns so source_external_id + is_broken still work.
  if (qRowResult.error && !questionRow) {
    const { data: fallbackRow } = await supabase
      .from('questions')
      .select('source_external_id, is_broken')
      .eq('id', questionId)
      .maybeSingle();
    questionRow = fallbackRow;
  }

  // Look up who flagged the question as broken (if applicable)
  let brokenByName = null;
  if (questionRow?.broken_by) {
    const { data: brokenProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', questionRow.broken_by)
      .maybeSingle();
    brokenByName = [brokenProfile?.first_name, brokenProfile?.last_name].filter(Boolean).join(' ')
      || brokenProfile?.email || null;
  }

  const userRole = profileResult.data?.role || (user ? 'practice' : null);

  // Security: only teachers/managers/admins may use view_as
  const isPrivilegedRole = ['teacher', 'manager', 'admin'].includes(userRole);
  const effectiveViewAs = viewAsStudentId && isPrivilegedRole ? viewAsStudentId : null;

  // If view_as was requested but caller isn't privileged, re-fetch status for the actual user
  let stData = stResult.data;
  let stError = stResult.error;
  if (viewAsStudentId && !isPrivilegedRole && user) {
    const refetch = await supabase
      .from('question_status')
      .select('user_id, question_id, is_done, marked_for_review, attempts_count, correct_attempts_count, last_attempt_at, last_is_correct, status_json, notes')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .maybeSingle();
    stData = refetch.data;
    stError = refetch.error;
  }

  const { data: st, error: stErr } = { data: stData, error: stError };
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 400 });

  // The user ID to look up attempts for (student being viewed, or the caller)
  const statusUserId = effectiveViewAs || user?.id;

  // ✅ Fallback for older data: if status_json doesn't include restore fields,
  // look up the most recent attempt and inject them into the response.
  let status = null;
  if (st) {
    const prevJson = st.status_json && typeof st.status_json === 'object' ? st.status_json : {};
    const needsLastSelected = st.is_done && version?.question_type === 'mcq' && prevJson.last_selected_option_id == null;
    const needsLastResponse = st.is_done && version?.question_type === 'spr' && (prevJson.last_response_text == null || prevJson.last_response_text === '');

    if (needsLastSelected || needsLastResponse) {
      const { data: lastAttempt, error: laErr } = await supabase
        .from('attempts')
        .select('selected_option_id, response_text, created_at')
        .eq('user_id', statusUserId)
        .eq('question_id', questionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!laErr && lastAttempt) {
        const patched = { ...prevJson };
        if (needsLastSelected) patched.last_selected_option_id = lastAttempt.selected_option_id ?? null;
        if (needsLastResponse) patched.last_response_text = lastAttempt.response_text ?? '';
        status = { ...st, status_json: patched };
      } else {
        status = st;
      }
    } else {
      status = st;
    }
  }

  // Correct answer key (only reveal for authed users AFTER they've completed the question,
  // or immediately for privileged roles so Teacher Mode can show answers without answering)
  const { data: ca } = caResult;
  let correct_option_id = null;
  let correct_text = null;
  if (user && (status?.is_done || isPrivilegedRole)) {
    if (version?.question_type === 'mcq') correct_option_id = ca?.correct_option_id ?? null;
    if (version?.question_type === 'spr') correct_text = ca?.correct_text ?? null;
  }

  return NextResponse.json({
    question_id: questionId,
    source_external_id: questionRow?.source_external_id ?? null,
    is_broken: questionRow?.is_broken ?? false,
    broken_by: brokenByName,
    broken_at: questionRow?.broken_at ?? null,
    user_role: userRole,
    version,
    options: options ?? [],
    taxonomy,
    status,
    correct_option_id,
    correct_text,
  });
}
