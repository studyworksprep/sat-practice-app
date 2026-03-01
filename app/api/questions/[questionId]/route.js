import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/questions/:questionId
export async function GET(_request, { params }) {
  const questionId = params.questionId;
  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  async function fetchVersion({ onlyCurrent }) {
    let q = supabase
      .from('question_versions')
      .select('id, question_id, question_type, stimulus_html, stem_html, rationale_html, created_at, is_current')
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (onlyCurrent) q = q.eq('is_current', true);

    const { data, error } = await q.maybeSingle();
    return { data, error };
  }

  // 1) Try current version
  let { data: version, error: verErr } = await fetchVersion({ onlyCurrent: true });

  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });

  // 2) Fallback: newest version (even if is_current is not set properly)
  if (!version) {
    const fallback = await fetchVersion({ onlyCurrent: false });
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 400 });
    version = fallback.data;
  }

  if (!version) {
    return NextResponse.json(
      { error: 'No question_versions found for this question.' },
      { status: 404 }
    );
  }

  // Options
  const { data: options, error: optErr } = await supabase
    .from('answer_options')
    .select('id, ordinal, label, content_html')
    .eq('question_version_id', version.id)
    .order('ordinal', { ascending: true });

  if (optErr) return NextResponse.json({ error: optErr.message }, { status: 400 });

  // Taxonomy (may be null; that's OK)
  const { data: taxonomy, error: taxErr } = await supabase
    .from('question_taxonomy')
    .select('question_id, program, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
    .eq('question_id', questionId)
    .maybeSingle();

  if (taxErr) return NextResponse.json({ error: taxErr.message }, { status: 400 });

  // Status (per user)
  let status = null;
  if (user) {
    const { data: st, error: stErr } = await supabase
      .from('question_status')
      .select('user_id, question_id, is_done, marked_for_review, is_broken, attempts_count, correct_attempts_count, last_attempt_at, last_is_correct, status_json, notes')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .maybeSingle();

    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 400 });

    // ✅ Fallback for older data: if status_json doesn't include restore fields,
    // look up the most recent attempt and inject them into the response.
    if (st) {
      const prevJson = st.status_json && typeof st.status_json === 'object' ? st.status_json : {};
      const needsLastSelected = st.is_done && version?.question_type === 'mcq' && prevJson.last_selected_option_id == null;
      const needsLastResponse = st.is_done && version?.question_type === 'spr' && (prevJson.last_response_text == null || prevJson.last_response_text === '');

      if (needsLastSelected || needsLastResponse) {
        const { data: lastAttempt, error: laErr } = await supabase
          .from('attempts')
          .select('selected_option_id, response_text, created_at')
          .eq('user_id', user.id)
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
    } else {
      status = null;
    }
  }


  // Correct answer key (only reveal for authed users AFTER they've completed the question)
  // This allows the UI to highlight correct/incorrect choices even after a refresh,
  // without exposing the answer key before submission.
  let correct_option_id = null;
  let correct_text = null;
  if (user && status?.is_done && version?.question_type === 'mcq') {
    const { data: ca, error: caErr } = await supabase
      .from('correct_answers')
      .select('correct_option_id')
      .eq('question_version_id', version.id)
      .limit(1)
      .maybeSingle();

    if (caErr) return NextResponse.json({ error: caErr.message }, { status: 400 });
    correct_option_id = ca?.correct_option_id ?? null;
  }

  // Reveal correct text only after completion for SPR
  if (user && status?.is_done && version?.question_type === 'spr') {
    const { data: ca, error: caErr } = await supabase
      .from('correct_answers')
      .select('correct_text')
      .eq('question_version_id', version.id)
      .limit(1)
      .maybeSingle();
    if (caErr) return NextResponse.json({ error: caErr.message }, { status: 400 });
    correct_text = ca?.correct_text ?? null;
  }

  return NextResponse.json({
    question_id: questionId,
    version,
    options: options ?? [],
    taxonomy,
    status,
    correct_option_id,
    correct_text,
  });
}
