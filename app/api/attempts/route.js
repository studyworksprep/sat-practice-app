import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// POST /api/attempts { question_id, selected_option_id, time_spent_ms }
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { question_id, selected_option_id, time_spent_ms } = body || {};
  if (!question_id) return NextResponse.json({ error: 'question_id required' }, { status: 400 });
  if (!selected_option_id) return NextResponse.json({ error: 'selected_option_id required' }, { status: 400 });

  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Determine correctness:
  // 1) get current version
  const { data: ver, error: verErr } = await supabase
    .from('question_versions')
    .select('id, question_id')
    .eq('question_id', question_id)
    .eq('is_current', true)
    .maybeSingle();
  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });
  if (!ver) return NextResponse.json({ error: 'No current version found' }, { status: 404 });

  // 2) get correct answer row for that version
  const { data: ca, error: caErr } = await supabase
    .from('correct_answers')
    .select('answer_type, correct_option_id, correct_option_ids, correct_text, correct_number, numeric_tolerance')
    .eq('question_version_id', ver.id)
    .maybeSingle();

  if (caErr) return NextResponse.json({ error: caErr.message }, { status: 400 });

  let is_correct = false;
  if (ca?.answer_type === 'single_choice') {
    is_correct = ca.correct_option_id === selected_option_id;
  } else if (ca?.answer_type === 'multiple_choice') {
    // For multi-select you would accept an array; this route currently supports single selected_option_id.
    is_correct = Array.isArray(ca.correct_option_ids) && ca.correct_option_ids.includes(selected_option_id);
  } else {
    // Fallback: treat as unknown type
    is_correct = false;
  }

  // Insert attempt
  const { error: insErr } = await supabase.from('attempts').insert({
    user_id: user.id,
    question_id,
    is_correct,
    selected_option_id,
    time_spent_ms: Number.isFinite(Number(time_spent_ms)) ? Number(time_spent_ms) : null,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // Upsert question_status counters
  // Read existing status
  const { data: st, error: stErr } = await supabase
    .from('question_status')
    .select('attempts_count, correct_attempts_count')
    .eq('user_id', user.id)
    .eq('question_id', question_id)
    .maybeSingle();
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 400 });

  const attempts_count = (st?.attempts_count ?? 0) + 1;
  const correct_attempts_count = (st?.correct_attempts_count ?? 0) + (is_correct ? 1 : 0);

  const { error: upErr } = await supabase
    .from('question_status')
    .upsert({
      user_id: user.id,
      question_id,
      is_done: true,
      attempts_count,
      correct_attempts_count,
      last_attempt_at: new Date().toISOString(),
      last_is_correct: is_correct,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,question_id' });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, is_correct });
}
