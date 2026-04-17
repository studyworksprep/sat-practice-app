// Shared practice-session Server Actions. See
// docs/architecture-plan.md §3.3, §3.4.
//
// submitAnswer is identical for student practice and tutor training
// — both flows use the same grading logic, the same practice_sessions
// ownership check, and the same watermarked rationale delivery. The
// only differences between the two flows are at the wrapper layer:
// the role gate (handled by each tree's page.js) and the URL prefix
// (handled by the basePath prop on PracticeInteractive). The action
// itself runs with requireUser() and verifies session.user_id ===
// auth.uid(), so a tutor answering their own training session gets
// the exact same code path as a student.
//
// This module exists so that both app/next/(student)/practice/s/.../
// and app/next/(tutor)/tutor/training/s/.../ import the same action.
// Phase 2 §3.1 principle: one canonical answer per question.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { applyWatermark } from '@/lib/content/watermark';

/**
 * Submit an answer for the current question in a practice session.
 * Handles both MCQ (optionId) and SPR (responseText) question types.
 *
 * Used by both student practice and tutor training flows — the action
 * doesn't care which tree invoked it, because it runs as the
 * authenticated user and verifies session ownership against
 * auth.uid(). The difference between practice and training is
 * expressed at the session-creation layer (mode='practice' vs
 * 'training'), not here.
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
  // ~1 submit every 30–180 seconds, so 2/second is generous. Same
  // limit applies to tutors in training mode.
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

  // Look up the question from v2. question_type + rationale_html +
  // correct_answer (jsonb) all live on the single row.
  const { data: question } = await supabase
    .from('questions_v2')
    .select('question_type, rationale_html, correct_answer')
    .eq('id', questionId)
    .maybeSingle();
  if (!question) return actionFail('Question not found');

  const isSpr = question.question_type === 'spr';
  const correct = question.correct_answer;

  if (isSpr && !responseText) {
    return actionFail('Please enter an answer before submitting.');
  }
  if (!isSpr && !selectedOptionId) {
    return actionFail('Please select an option before submitting.');
  }

  // Grade the submission against correct_answer (jsonb).
  let isCorrect = false;
  if (isSpr) {
    isCorrect = gradeSprAnswer(responseText, correct);
  } else if (selectedOptionId) {
    isCorrect = gradeMcqAnswer(selectedOptionId, correct);
  }

  // Insert the attempts row. v2 option codes ('A'/'B'/...) go into
  // response_text since the legacy selected_option_id column is a uuid.
  // RLS allows user_id = auth.uid() for insert.
  const { error: insertErr } = await supabase.from('attempts').insert({
    user_id: user.id,
    question_id: questionId,
    is_correct: isCorrect,
    selected_option_id: null,
    response_text: isSpr ? responseText : selectedOptionId,
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
  // next navigation. No-op for tutors (they aren't on /dashboard)
  // but harmless.
  revalidatePath('/dashboard');

  return actionOk({
    isCorrect,
    questionType: question.question_type,
    correctOptionId: !isSpr ? extractMcqCorrectId(correct) : null,
    // For SPR questions, the display string shown in the reviewed
    // state ("The correct answer was: 12.5 or 25/2"). For MCQ this
    // is null — the UI highlights the correct option radio instead.
    correctAnswerDisplay: isSpr ? formatSprCorrectV2(correct) : null,
    // Watermark the rationale too. This is the only place rationale
    // ever crosses the wire to the client.
    rationaleHtml: applyWatermark(question.rationale_html, user.id),
  });
}

// MCQ correct_answer jsonb: a string like "A" or an array ["A","C"].
function gradeMcqAnswer(selectedId, correct) {
  if (correct == null) return false;
  if (Array.isArray(correct)) return correct.map(String).includes(selectedId);
  return String(correct) === selectedId;
}

function extractMcqCorrectId(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  return null;
}

function formatSprCorrectV2(raw) {
  if (raw == null) return '—';
  if (Array.isArray(raw)) return raw.map(String).join(' or ');
  return String(raw);
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

// v2 SPR correct_answer jsonb: a single string/number, or an array
// of accepted values. Numeric matches are exact unless the app ever
// records a tolerance (not supported in v2's current shape; add later
// if needed).
function gradeSprAnswer(responseText, correct) {
  if (correct == null) return false;
  const acceptable = Array.isArray(correct) ? correct.map(String) : [String(correct)];
  const normalized = normalizeText(responseText);
  if (acceptable.some((a) => normalizeText(a) === normalized)) {
    return true;
  }
  const responseNum = parseFloat(responseText);
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
