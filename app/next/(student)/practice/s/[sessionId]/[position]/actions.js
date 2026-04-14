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
 * Handles both MCQ (optionId) and SPR (responseText) question types.
 *
 * @param {string} sessionId
 * @param {number} position
 * @param {{ optionId?: string|null, responseText?: string|null }} answer
 * @returns {Promise<{ok, data?, error?}>}
 */
export async function submitAnswer(sessionId, position, answer) {
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

  const selectedOptionId = answer?.optionId ?? null;
  const responseText = (answer?.responseText ?? '').toString().trim();

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

  const isSpr = version.question_type === 'spr';
  if (isSpr && !responseText) {
    return actionFail('Please enter an answer before submitting.');
  }
  if (!isSpr && !selectedOptionId) {
    return actionFail('Please select an option before submitting.');
  }

  // Grade the submission.
  let isCorrect = false;
  if (isSpr) {
    isCorrect = gradeSprAnswer(responseText, correctAnswer);
  } else if (selectedOptionId) {
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
    response_text: isSpr ? responseText : null,
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
    questionType: version.question_type,
    correctOptionId: correctAnswer.correct_option_id ?? null,
    // For SPR questions, the display string shown in the reviewed
    // state ("The correct answer was: 12.5 or 25/2"). For MCQ this
    // is null — the UI highlights the correct option radio instead.
    correctAnswerDisplay: isSpr ? formatSprCorrectAnswer(correctAnswer) : null,
    // Watermark the rationale too. This is the only place rationale
    // ever crosses the wire to the client.
    rationaleHtml: applyWatermark(version.rationale_html, user.id),
  });
}

// ──────────────────────────────────────────────────────────────
// SPR grading helpers
// ──────────────────────────────────────────────────────────────
//
// SPR (student-produced response) answers are compared in two ways,
// in order:
//
//   1) Text comparison. `correct_text` may be a plain string or a
//      JSON array of acceptable answers (e.g. "12.5", "25/2", "0.5").
//      The student's response is normalized (lowercased,
//      whitespace-collapsed, trimmed) and compared against each
//      acceptable form.
//
//   2) Numeric comparison. If text comparison fails and both the
//      student's response and `correct_number` parse as floats, they
//      are compared with `numeric_tolerance` (defaulting to 0).
//
// This matches the existing grading logic in the legacy submit-module
// route handler.

function normalizeText(s) {
  return (s ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseCorrectTextList(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      // fall through
    }
  }
  return [s];
}

function gradeSprAnswer(responseText, correctAnswer) {
  // Text match first
  const acceptable = parseCorrectTextList(correctAnswer.correct_text);
  const normalized = normalizeText(responseText);
  if (acceptable.some((a) => normalizeText(a) === normalized)) {
    return true;
  }
  // Numeric fallback
  const responseNum = parseFloat(responseText);
  if (Number.isFinite(responseNum) && correctAnswer.correct_number != null) {
    const tol = parseFloat(correctAnswer.numeric_tolerance) || 0;
    const correctNum = parseFloat(correctAnswer.correct_number);
    if (Number.isFinite(correctNum) && Math.abs(responseNum - correctNum) <= tol) {
      return true;
    }
  }
  // Also allow a numeric match against any acceptable text entry
  // (e.g. correct_text = ["12.5", "25/2"] — 12.5 should match).
  if (Number.isFinite(responseNum)) {
    for (const entry of acceptable) {
      const entryNum = parseFloat(entry);
      if (Number.isFinite(entryNum) && entryNum === responseNum) {
        return true;
      }
    }
  }
  return false;
}

function formatSprCorrectAnswer(correctAnswer) {
  const list = parseCorrectTextList(correctAnswer.correct_text);
  if (list.length > 0) return list.join(' or ');
  if (correctAnswer.correct_number != null) {
    return String(correctAnswer.correct_number);
  }
  return '—';
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
