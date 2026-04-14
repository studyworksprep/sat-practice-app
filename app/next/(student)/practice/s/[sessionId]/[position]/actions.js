// Server Actions for the in-session question page. See
// docs/architecture-plan.md §3.7, §3.9.
//
// Two actions here:
//
//   submitAnswer(sessionId, position, selectedOptionId)
//     - Validates that the session belongs to the caller and that
//       the given position really points at the expected question.
//     - Looks up the correct_answer from the v1 correct_answers table.
//     - Grades the submission, inserts an attempts row, upserts
//       question_status.
//     - Returns { ok: true, data: { isCorrect, correctOptionId,
//       rationaleHtml } } — this is the ONLY path by which the
//       correct answer and rationale reach the client. Server-gated
//       on the existence of the attempts row, per §3.7.
//
//   goToPosition(sessionId, newPosition)
//     - Thin wrapper that validates + redirects to the next question.
//     - Updates practice_sessions.current_position as a side effect
//       so a reload from any point picks up where the student left off.

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { applyWatermark } from '@/lib/content/watermark';

/**
 * Submit an answer for the current question in a practice session.
 *
 * @param {string} sessionId
 * @param {number} position
 * @param {string|null} selectedOptionId
 * @returns {Promise<{ok, data?, error?}>}
 */
export async function submitAnswer(sessionId, position, selectedOptionId) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  // Rate limit: 120 submits per minute per user. A real student does
  // ~1 submit every 30–180 seconds, so 2/second is generous.
  const rl = await rateLimit(`practice-submit:${user.id}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many submissions. Please slow down.');
  }

  // Load the session and verify ownership + position.
  const { data: session, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr || !session) return actionFail('Session not found');
  if (session.user_id !== user.id) return actionFail('Session not found');

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (!Number.isInteger(position) || position < 0 || position >= questionIds.length) {
    return actionFail('Invalid session position');
  }
  const questionId = questionIds[position];

  // Look up the current version + correct answer + rationale. The
  // correct_answer row carries correct_option_id (MCQ) or
  // correct_text/correct_number (SPR). Rationale is on the version row.
  const { data: version } = await supabase
    .from('question_versions')
    .select('id, question_type, rationale_html')
    .eq('question_id', questionId)
    .eq('is_current', true)
    .maybeSingle();
  if (!version) return actionFail('Question version not found');

  const { data: correctAnswer } = await supabase
    .from('correct_answers')
    .select('correct_option_id, correct_option_ids, correct_text, correct_number, numeric_tolerance, answer_type')
    .eq('question_version_id', version.id)
    .maybeSingle();
  if (!correctAnswer) return actionFail('Answer key not found');

  // Grade. MCQ only in this first commit; SPR follows in a subsequent PR.
  let isCorrect = false;
  if (selectedOptionId) {
    if (correctAnswer.correct_option_id) {
      isCorrect = correctAnswer.correct_option_id === selectedOptionId;
    }
    if (!isCorrect && Array.isArray(correctAnswer.correct_option_ids)) {
      isCorrect = correctAnswer.correct_option_ids.includes(selectedOptionId);
    }
  }

  // Insert the attempts row. RLS allows user_id = auth.uid() for
  // insert via the existing policies on the attempts table.
  const { error: insertErr } = await supabase.from('attempts').insert({
    user_id: user.id,
    question_id: questionId,
    is_correct: isCorrect,
    selected_option_id: selectedOptionId || null,
    source: 'practice',
  });
  if (insertErr) {
    return actionFail(`Failed to record attempt: ${insertErr.message}`);
  }

  // Upsert question_status for dashboard stats. Fire-and-forget-ish:
  // if it fails we still return the grading result to the student.
  // The attempts insert is the authoritative record.
  try {
    await supabase.rpc('upsert_question_status_after_attempt', {
      p_user_id: user.id,
      p_question_id: questionId,
      p_is_correct: isCorrect,
    });
  } catch {
    // Legacy helper may not exist; ignore. Dashboard stats degrade gracefully.
  }

  // Revalidate the dashboard path so the stats card refreshes on
  // next navigation. The session page itself doesn't need
  // revalidation — the attempts row drives the "reviewed" state
  // and the student will move to the next position immediately.
  revalidatePath('/dashboard');

  return actionOk({
    isCorrect,
    correctOptionId: correctAnswer.correct_option_id ?? null,
    // Watermark the rationale too. This is the only place rationale
    // ever crosses the wire to the client.
    rationaleHtml: applyWatermark(version.rationale_html, user.id),
  });
}

/**
 * Navigate to a specific position within the active session. Updates
 * current_position server-side and redirects. Prev/next buttons call
 * this with position ± 1.
 */
export async function goToPosition(sessionId, newPosition) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.user_id !== user.id) {
    return actionFail('Session not found');
  }

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  const clamped = Math.max(0, Math.min(Number(newPosition), questionIds.length));
  if (!Number.isInteger(clamped)) return actionFail('Invalid position');

  if (clamped >= questionIds.length) {
    redirect('/dashboard?session_complete=1');
  }

  await supabase
    .from('practice_sessions')
    .update({
      current_position: clamped,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  redirect(`/practice/s/${sessionId}/${clamped}`);
}
