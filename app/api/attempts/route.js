import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// POST /api/attempts
// body: { question_id, selected_option_id?, response_text?, time_spent_ms? }
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { question_id, selected_option_id, response_text, time_spent_ms } = body || {};
  if (!question_id) return NextResponse.json({ error: 'question_id required' }, { status: 400 });

  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // 1) Fetch current version (use newest current if multiple)
  const { data: ver, error: verErr } = await supabase
    .from('question_versions')
    .select('id, question_id, question_type, created_at')
    .eq('question_id', question_id)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });
  if (!ver) return NextResponse.json({ error: 'No current version found' }, { status: 404 });

  // 2) Fetch correct answer for this version (newest if multiple)
  const { data: caRows, error: caErr } = await supabase
    .from('correct_answers')
    .select('correct_option_id, correct_text, created_at')
    .eq('question_version_id', ver.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (caErr) return NextResponse.json({ error: caErr.message }, { status: 400 });
  const ca = caRows?.[0] ?? null;

  // 3) Determine correctness based on question_type
  let is_correct = false;

  if (ver.question_type === 'mcq') {
    if (!selected_option_id) {
      return NextResponse.json({ error: 'selected_option_id required for mcq' }, { status: 400 });
    }
    is_correct =
      ca?.correct_option_id &&
      String(ca.correct_option_id) === String(selected_option_id);
  } else if (ver.question_type === 'spr') {
    if (typeof response_text !== 'string' || response_text.trim() === '') {
      return NextResponse.json({ error: 'response_text required for spr' }, { status: 400 });
    }

    const norm = (s) =>
      String(s ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    is_correct = ca?.correct_text && norm(ca.correct_text) === norm(response_text);
  } else {
    // Unknown type (keep false, or you could error)
    is_correct = false;
  }

  // 4) Insert attempt row
  const { error: insErr } = await supabase.from('attempts').insert({
    user_id: user.id,
    question_id,
    is_correct,
    selected_option_id: ver.question_type === 'mcq' ? selected_option_id : null,
    response_text: ver.question_type === 'spr' ? response_text : null,
    time_spent_ms: Number.isFinite(Number(time_spent_ms)) ? Number(time_spent_ms) : null,
  });

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  // 5) Update / upsert question_status counters
  const { data: st, error: stErr } = await supabase
    .from('question_status')
    .select('attempts_count, correct_attempts_count, marked_for_review')
    .eq('user_id', user.id)
    .eq('question_id', question_id)
    .maybeSingle();

  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 400 });

  const attempts_count = (st?.attempts_count ?? 0) + 1;
  const correct_attempts_count = (st?.correct_attempts_count ?? 0) + (is_correct ? 1 : 0);

  const { error: upErr } = await supabase
    .from('question_status')
    .upsert(
      {
        user_id: user.id,
        question_id,
        is_done: true,
        attempts_count,
        correct_attempts_count,
        last_attempt_at: new Date().toISOString(),
        last_is_correct: is_correct,
        updated_at: new Date().toISOString(),
        // preserve marked_for_review if already set
        marked_for_review: st?.marked_for_review ?? false,
      },
      { onConflict: 'user_id,question_id' }
    );

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, is_correct, attempts_count, correct_attempts_count });
}
