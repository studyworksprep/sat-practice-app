import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/questions/:questionId
export async function GET(_request, { params }) {
  const questionId = params.questionId;
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  // Find current version
  const { data: versions, error: verErr } = await supabase
    .from('question_versions')
    .select('id, question_id, is_current, stimulus_html, stem_html, rationale_html')
    .eq('question_id', questionId)
    .eq('is_current', true)
    .limit(1);

  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });
  const version = versions?.[0];
  if (!version) return NextResponse.json({ error: 'No current version found for question.' }, { status: 404 });

  // Options
  const { data: options, error: optErr } = await supabase
    .from('answer_options')
    .select('id, ordinal, label, content_html')
    .eq('question_version_id', version.id)
    .order('ordinal', { ascending: true });

  if (optErr) return NextResponse.json({ error: optErr.message }, { status: 400 });

  // Taxonomy
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
      .select('user_id, question_id, is_done, marked_for_review, attempts_count, correct_attempts_count, last_attempt_at, last_is_correct, notes')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .maybeSingle();
    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 400 });
    status = st;
  }

  return NextResponse.json({ question_id: questionId, version, options, taxonomy, status });
}
