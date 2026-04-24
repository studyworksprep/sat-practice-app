// Time-ping endpoint — a minimal POST route that accepts a
// time-only delta for a practice-test question and accumulates
// it into attempts.time_spent_ms. Exists because Server Actions
// don't play nicely with navigator.sendBeacon: sendBeacon needs a
// stable URL + JSON/form-data payload, while Server Actions
// route through Next.js' internal action dispatcher under URLs
// that can change between builds.
//
// Called from the test runner on visibilitychange + beforeunload
// so the current question's stopwatch delta lands durably even
// if the student closes the tab or kills the browser. Same
// accumulation semantics as the time-only path in the
// recordItemAnswer Server Action; any race with a concurrent
// action call is fine because both paths do read-add-write on
// the same attempts row, and later arrivals just re-read the
// by-then-updated value.
//
// Auth: requireUser() via the standard Supabase cookie; sendBeacon
// carries cookies by default, so the session survives across the
// beacon call.

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  }

  const moduleAttemptId = String(body?.moduleAttemptId ?? '');
  const moduleItemId    = String(body?.moduleItemId ?? '');
  const rawDelta        = Number(body?.timeSpentMs ?? 0);
  const timeDelta = Number.isFinite(rawDelta) && rawDelta > 0
    ? Math.min(Math.round(rawDelta), 3_600_000)
    : 0;

  if (!moduleAttemptId || !moduleItemId || timeDelta === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let ctx;
  try { ctx = await requireUser(); }
  catch { return NextResponse.json({ ok: false, error: 'unauth' }, { status: 401 }); }
  const { user, supabase } = ctx;

  // Verify ownership + that the module is still active — a closed
  // module shouldn't accept late time pings. Same semantics as
  // the Server Action's guards.
  const { data: moduleAttempt } = await supabase
    .from('practice_test_module_attempts_v2')
    .select('id, finished_at, practice_test_attempt:practice_test_attempts_v2(user_id, status)')
    .eq('id', moduleAttemptId)
    .maybeSingle();
  if (!moduleAttempt) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 });
  if (moduleAttempt.practice_test_attempt.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  if (moduleAttempt.finished_at) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Find or create the item-attempt row, accumulate time.
  const { data: existingItem } = await supabase
    .from('practice_test_item_attempts_v2')
    .select('id, attempt_id')
    .eq('practice_test_module_attempt_id', moduleAttemptId)
    .eq('practice_test_module_item_id', moduleItemId)
    .maybeSingle();

  if (existingItem) {
    const { data: current } = await supabase
      .from('attempts')
      .select('time_spent_ms')
      .eq('id', existingItem.attempt_id)
      .maybeSingle();
    const next = (current?.time_spent_ms ?? 0) + timeDelta;
    await supabase
      .from('attempts')
      .update({ time_spent_ms: next })
      .eq('id', existingItem.attempt_id);
    return NextResponse.json({ ok: true });
  }

  // No existing item — insert a placeholder attempts row + the
  // item-attempt link, matching the time-only branch in the
  // Server Action.
  const { data: moduleItem } = await supabase
    .from('practice_test_module_items_v2')
    .select('question_id')
    .eq('id', moduleItemId)
    .maybeSingle();
  if (!moduleItem) return NextResponse.json({ ok: false, error: 'item not found' }, { status: 404 });

  const { data: attemptRow } = await supabase
    .from('attempts')
    .insert({
      user_id: user.id,
      question_id: moduleItem.question_id,
      is_correct: false,
      selected_option_id: null,
      response_text: null,
      source: 'practice_test',
      time_spent_ms: timeDelta,
    })
    .select('id')
    .single();
  if (!attemptRow) return NextResponse.json({ ok: false, error: 'attempt insert failed' }, { status: 500 });

  await supabase
    .from('practice_test_item_attempts_v2')
    .insert({
      practice_test_module_attempt_id: moduleAttemptId,
      practice_test_module_item_id: moduleItemId,
      attempt_id: attemptRow.id,
    });

  return NextResponse.json({ ok: true });
}
