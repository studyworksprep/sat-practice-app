import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// POST /api/act/submit
// Body: { question_id, selected_option_id, time_spent_ms? }
export const POST = legacyApiRoute(async (request) => {
  const { user, supabase } = await requireUser();
  const userId = user.id;

  const body = await request.json();
  const { question_id, selected_option_id, time_spent_ms } = body;

  if (!question_id || !selected_option_id) {
    return NextResponse.json({ error: 'question_id and selected_option_id are required' }, { status: 400 });
  }

  // Look up the selected option to determine correctness
  const { data: option, error: optErr } = await supabase
    .from('act_answer_options')
    .select('id, is_correct, question_id')
    .eq('id', selected_option_id)
    .eq('question_id', question_id)
    .maybeSingle();

  if (optErr) return NextResponse.json({ error: optErr.message }, { status: 400 });
  if (!option) return NextResponse.json({ error: 'Invalid option for this question' }, { status: 400 });

  const is_correct = option.is_correct;

  // Insert attempt
  const { data: attempt, error: insertErr } = await supabase
    .from('act_attempts')
    .insert({
      user_id: userId,
      question_id,
      selected_option_id,
      is_correct,
      time_spent_ms: time_spent_ms ?? null,
      source: 'practice',
    })
    .select('id, is_correct, created_at')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  // Fetch correct option to return
  const { data: correctOpt } = await supabase
    .from('act_answer_options')
    .select('id')
    .eq('question_id', question_id)
    .eq('is_correct', true)
    .maybeSingle();

  return NextResponse.json({
    attempt_id: attempt.id,
    is_correct,
    correct_option_id: correctOpt?.id ?? null,
  });
});
