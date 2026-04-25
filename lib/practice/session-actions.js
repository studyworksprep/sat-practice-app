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
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';

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
 * Uses the (_prev, formData) signature shared by countAvailable /
 * createSession on the start page — the client PracticeInteractive
 * posts a FormData with sessionId, position, and either optionId
 * (MCQ) or responseText (SPR).
 *
 * @returns {Promise<{ok, isCorrect?, correctOptionId?, correctAnswerDisplay?, rationaleHtml?, questionType?, error?}>}
 */
export async function submitAnswer(_prev, formData) {
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

  const sessionId = String(formData.get('sessionId') ?? '');
  const position = Number(formData.get('position'));
  const selectedOptionId = formData.get('optionId');
  const responseText = (formData.get('responseText') ?? '').toString().trim();

  // Load the session and verify ownership + position.
  // filter_criteria.assignment_id is set when startAssignmentPractice
  // created this session — we read it here to decide whether to run
  // the assignment-completion check after recording the attempt.
  const { data: session, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, filter_criteria')
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

  // Assignment auto-completion. If this session was started from an
  // assignment, check whether every question in that assignment now
  // has an attempt from this student and, if so, set completed_at on
  // the junction row. Any attempt counts — correct or not — matching
  // the "student has engaged with every question" semantics.
  // Best-effort: a failure here does not block returning the grading
  // result to the student.
  const assignmentId = session.filter_criteria?.assignment_id;
  if (assignmentId) {
    try {
      await markAssignmentCompletedIfDone(supabase, user.id, assignmentId);
    } catch {
      // Swallow — the student's attempt is recorded either way.
    }
  }

  // Revalidate the dashboard path so the stats card refreshes on
  // next navigation. No-op for tutors (they aren't on /dashboard)
  // but harmless.
  revalidatePath('/dashboard');

  return {
    ok: true,
    isCorrect,
    questionType: question.question_type,
    correctOptionId: !isSpr ? extractMcqCorrectId(correct) : null,
    // For SPR questions, the display string shown in the reviewed
    // state ("The correct answer was: 12.5 or 25/2"). For MCQ this
    // is null — the UI highlights the correct option radio instead.
    correctAnswerDisplay: isSpr ? formatSprCorrect(correct) : null,
    // Watermark the rationale too. This is the only place rationale
    // ever crosses the wire to the client.
    rationaleHtml: applyWatermark(question.rationale_html, user.id),
  };
}

// ──────────────────────────────────────────────────────────────
// Session lifecycle: Submit Set and Abandon Set
// ──────────────────────────────────────────────────────────────
//
// Both flip practice_sessions.status — submit → 'completed',
// abandon → 'abandoned' — and both verify ownership. Neither is
// destructive on the content side: attempts rows stay where they
// are, and a submitted-but-incomplete session's unanswered
// questions render on the review report as Unanswered via the
// existing firstAttemptByQid-null branch.
//
// Only transition from 'in_progress' — calling submit/abandon on
// an already-closed session is a no-op so double-clicks are safe.

/**
 * Mark a practice session as completed. Callers redirect into the
 * session report afterwards; this action only touches the DB.
 * Any questions the student didn't answer stay unanswered — the
 * review report surfaces them as Unanswered automatically.
 */
export async function submitPracticeSession(_prev, formData) {
  let ctx;
  try { ctx = await requireUser(); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId) return actionFail('sessionId required');

  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return actionFail('Session not found');
  if (session.user_id !== user.id) return actionFail('Session not found');

  // Idempotent — if it's already completed, just return success
  // so the client can navigate to the report without friction.
  if (session.status === 'completed') return { ok: true, sessionId };
  if (session.status === 'abandoned') return actionFail('Session was abandoned');

  const { error } = await supabase
    .from('practice_sessions')
    .update({
      status: 'completed',
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('status', 'in_progress');
  if (error) return actionFail(`Could not submit session: ${error.message}`);

  return { ok: true, sessionId };
}

/**
 * Mark a practice session as abandoned. No review report is
 * generated — the session just disappears from the in-progress
 * list. Existing attempts stay on the student's record (they
 * answered those questions, after all).
 */
export async function abandonPracticeSession(_prev, formData) {
  let ctx;
  try { ctx = await requireUser(); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId) return actionFail('sessionId required');

  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return actionFail('Session not found');
  if (session.user_id !== user.id) return actionFail('Session not found');

  if (session.status !== 'in_progress') return { ok: true, sessionId };

  const { error } = await supabase
    .from('practice_sessions')
    .update({
      status: 'abandoned',
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('status', 'in_progress');
  if (error) return actionFail(`Could not abandon session: ${error.message}`);

  return { ok: true, sessionId };
}

// ──────────────────────────────────────────────────────────────
// Assignment auto-completion
// ──────────────────────────────────────────────────────────────
//
// "Completed" = the student has at least one attempt against every
// question in the assignment's question_ids. Order-independent, so
// skipping around or returning later both work correctly.
//
// We query attempts directly instead of question_status: the latter
// is maintained by a legacy RPC that may not exist in every
// environment (see the "legacy helper may not exist" comment above),
// and attempts is the authoritative record anyway. An index on
// attempts(user_id, question_id) makes the IN-lookup cheap.
//
// The UPDATE is guarded by completed_at IS NULL — two near-
// simultaneous attempts can't race-set it twice, and once set, it
// stays set.
//
// Only runs for 'questions' assignments: for 'practice_test' and
// 'lesson', completion is a different concept and lives elsewhere.
async function markAssignmentCompletedIfDone(supabase, userId, assignmentId) {
  const { data: assignment } = await supabase
    .from('assignments_v2')
    .select('id, assignment_type, question_ids')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return;
  if (assignment.assignment_type !== 'questions') return;

  const questionIds = Array.isArray(assignment.question_ids)
    ? assignment.question_ids
    : [];
  if (questionIds.length === 0) return;

  const { data: attempted } = await supabase
    .from('attempts')
    .select('question_id')
    .eq('user_id', userId)
    .in('question_id', questionIds);

  const distinct = new Set((attempted ?? []).map((r) => r.question_id));
  if (distinct.size < questionIds.length) return;

  await supabase
    .from('assignment_students_v2')
    .update({ completed_at: new Date().toISOString() })
    .eq('assignment_id', assignmentId)
    .eq('student_id', userId)
    .is('completed_at', null);
}

// MCQ grading against v2's object-shaped correct_answer:
//   { option_label: "B" }                     → single-answer
//   { option_labels: ["A","C"], option_label: null } → multi-answer
// Legacy shapes ("B" as a plain string, or ["A","C"] as a bare
// array) stay accepted for any row that still surfaces them.
function gradeMcqAnswer(selectedId, correct) {
  if (correct == null) return false;
  if (typeof correct === 'string') return correct === selectedId;
  if (Array.isArray(correct)) return correct.map(String).includes(selectedId);
  if (typeof correct === 'object') {
    if (typeof correct.option_label === 'string' && correct.option_label) {
      return correct.option_label === selectedId;
    }
    if (Array.isArray(correct.option_labels) && correct.option_labels.length > 0) {
      return correct.option_labels.map(String).includes(selectedId);
    }
  }
  return false;
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

// SPR grading against v2's object-shaped correct_answer:
//   { text: "[\"1/14\", \".0714\"]",   // JSON-encoded array of strings
//     number: 0.0714,                   // numeric value
//     tolerance: null }                 // numeric match tolerance
// Also accepts the legacy shapes (plain string, plain array,
// plain number) for any row that still surfaces them.
//
// Match logic:
//   1. Collect acceptable strings from .text (JSON-parse if it's
//      an array, else treat as a single-value string).
//   2. Text-normalize (lowercase, whitespace-collapse) both sides
//      and compare.
//   3. If text match fails and both sides parse as floats,
//      compare numerically, respecting tolerance if present.
function gradeSprAnswer(responseText, correct) {
  if (correct == null) return false;

  const acceptableTexts = [];
  let numericTarget = null;
  let tolerance = 0;

  if (typeof correct === 'string') {
    acceptableTexts.push(correct);
  } else if (Array.isArray(correct)) {
    for (const v of correct) acceptableTexts.push(String(v));
  } else if (typeof correct === 'object') {
    if (typeof correct.text === 'string' && correct.text) {
      try {
        const parsed = JSON.parse(correct.text);
        if (Array.isArray(parsed)) {
          for (const v of parsed) acceptableTexts.push(String(v));
        } else {
          acceptableTexts.push(correct.text);
        }
      } catch {
        acceptableTexts.push(correct.text);
      }
    }
    if (typeof correct.number === 'number') {
      numericTarget = correct.number;
      acceptableTexts.push(String(correct.number));
    }
    if (typeof correct.tolerance === 'number') tolerance = correct.tolerance;
  } else if (typeof correct === 'number') {
    numericTarget = correct;
    acceptableTexts.push(String(correct));
  }

  if (acceptableTexts.length === 0 && numericTarget == null) return false;

  const normalized = normalizeText(responseText);
  if (acceptableTexts.some((a) => normalizeText(a) === normalized)) return true;

  const responseNum = parseFloat(responseText);
  if (Number.isFinite(responseNum)) {
    if (numericTarget != null && Math.abs(responseNum - numericTarget) <= tolerance) {
      return true;
    }
    for (const entry of acceptableTexts) {
      const entryNum = parseFloat(entry);
      if (Number.isFinite(entryNum) && Math.abs(responseNum - entryNum) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}
