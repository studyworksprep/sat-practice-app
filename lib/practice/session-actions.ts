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

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';
import { gradeActMcq } from '@/lib/practice/load-act-question';
import type { ActionResult, QuestionType } from '@/lib/types';

type SubmitAnswerResult = ActionResult<{
  isCorrect: boolean;
  questionType: QuestionType;
  correctOptionId: string | null;
  correctAnswerDisplay: string | null;
  rationaleHtml: string | null;
}>;

type SessionLifecycleResult = ActionResult<{ sessionId: string }>;

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
 */
export async function submitAnswer(
  _prev: unknown,
  formData: FormData,
): Promise<SubmitAnswerResult> {
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

  // Load the session and verify ownership + position. We pull
  // test_type so the grading + write paths fork between SAT (queries
  // questions_v2 + writes attempts) and ACT (act_questions /
  // act_answer_options + act_attempts). See §3.4 — the loader / write-
  // action layer is where the fork lives, the action interface stays
  // unified.
  const { data: session, error: sessionErr } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, filter_criteria, created_at, test_type')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr || !session) return actionFail('Session not found');
  if (session.user_id !== user.id) return actionFail('Session not found');

  const questionIds: string[] = Array.isArray(session.question_ids)
    ? session.question_ids
    : [];
  if (!Number.isInteger(position) || position < 0 || position >= questionIds.length) {
    return actionFail('Invalid session position');
  }
  const questionId = questionIds[position];
  const isAct = session.test_type === 'act';
  const sessionFloor = session.created_at ?? '1970-01-01T00:00:00Z';

  let isCorrect = false;
  let questionType: QuestionType = 'mcq';
  let correctOptionIdOut: string | null = null;
  let correctAnswerDisplay: string | null = null;
  let rationaleHtml: string | null = null;

  if (isAct) {
    // ACT is MCQ-only today. selectedOptionId carries the
    // act_answer_options.id UUID; we grade by looking up the
    // question's correct option and comparing UUIDs.
    if (!selectedOptionId) {
      return actionFail('Please select an option before submitting.');
    }
    const grade = await gradeActMcq(supabase, questionId, String(selectedOptionId));
    isCorrect = grade.isCorrect;
    correctOptionIdOut = grade.correctOptionId;

    const { data: questionRow } = await supabase
      .from('act_questions')
      .select('rationale_html')
      .eq('id', questionId)
      .maybeSingle();
    if (!questionRow) return actionFail('Question not found');
    rationaleHtml = applyWatermark(
      (questionRow as { rationale_html: string | null }).rationale_html ?? '',
      user.id,
    );

    // First-attempt-wins inside the session window.
    const { data: existing } = await supabase
      .from('act_attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .gte('created_at', sessionFloor)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from('act_attempts').insert({
        user_id: user.id,
        question_id: questionId,
        selected_option_id: String(selectedOptionId),
        is_correct: isCorrect,
        source: 'practice',
      });
      if (insertErr) {
        return actionFail(`Failed to record attempt: ${insertErr.message}`);
      }
    }
  } else {
    // SAT path. Look up the question from v2 — question_type +
    // rationale_html + correct_answer (jsonb) all live on the
    // single row.
    const { data: question } = await supabase
      .from('questions_v2')
      .select('question_type, rationale_html, correct_answer')
      .eq('id', questionId)
      .maybeSingle();
    if (!question) return actionFail('Question not found');

    const isSpr = question.question_type === 'spr';
    const correct = question.correct_answer;
    questionType = question.question_type as QuestionType;

    if (isSpr && !responseText) {
      return actionFail('Please enter an answer before submitting.');
    }
    if (!isSpr && !selectedOptionId) {
      return actionFail('Please select an option before submitting.');
    }

    if (isSpr) {
      isCorrect = gradeSprAnswer(responseText, correct);
    } else if (selectedOptionId) {
      isCorrect = gradeMcqAnswer(String(selectedOptionId), correct);
    }

    correctOptionIdOut = !isSpr ? extractMcqCorrectId(correct) : null;
    correctAnswerDisplay = isSpr ? formatSprCorrect(correct) : null;
    rationaleHtml = applyWatermark(question.rationale_html, user.id);

    // First-attempt-wins inside the session window.
    const { data: existing } = await supabase
      .from('attempts')
      .select('id')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .gte('created_at', sessionFloor)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from('attempts').insert({
        user_id: user.id,
        question_id: questionId,
        is_correct: isCorrect,
        selected_option_id: null,
        response_text: isSpr ? responseText : String(selectedOptionId),
        source: 'practice',
      });
      if (insertErr) {
        return actionFail(`Failed to record attempt: ${insertErr.message}`);
      }
    }

    // Dashboard stats — SAT-side legacy helper. Best-effort; if it
    // fails the attempts insert remains authoritative.
    try {
      await supabase.rpc('upsert_question_status_after_attempt', {
        p_user_id: user.id,
        p_question_id: questionId,
        p_is_correct: isCorrect,
      });
    } catch {
      // Legacy helper may not exist; ignore. Dashboard stats degrade gracefully.
    }
  }

  // Assignment auto-completion. SAT-only path today — ACT assignments
  // are forward-wired but no surface ships yet, so markAssignment...
  // is keyed off the SAT attempts table.
  if (!isAct) {
    const assignmentId: string | undefined = session.filter_criteria?.assignment_id;
    if (assignmentId) {
      try {
        await markAssignmentCompletedIfDone(supabase, user.id, assignmentId);
      } catch {
        // Swallow — the student's attempt is recorded either way.
      }
    }
  }

  return {
    ok: true,
    isCorrect,
    questionType,
    correctOptionId: correctOptionIdOut,
    correctAnswerDisplay,
    rationaleHtml,
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
export async function submitPracticeSession(
  _prev: unknown,
  formData: FormData,
): Promise<SessionLifecycleResult> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const sessionId = String(formData.get('sessionId') ?? '');
  if (!sessionId) return actionFail('sessionId required');

  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, status, filter_criteria')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return actionFail('Session not found');
  if (session.user_id !== user.id) return actionFail('Session not found');
  if (session.status === 'abandoned') return actionFail('Session was abandoned');

  // Flip the session to completed if it isn't already. The
  // ownership check above covers the security gate; the status
  // guard here just means a re-submit is a no-op write rather
  // than a redundant flip.
  if (session.status !== 'completed') {
    const { error } = await supabase
      .from('practice_sessions')
      .update({
        status: 'completed',
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', 'in_progress');
    if (error) return actionFail(`Could not submit session: ${error.message}`);
  }

  // Assignment completion. Submit Set is the explicit "I'm done"
  // signal — bump completed_at on every submit (even re-submits)
  // so the report-of-record always points to the latest run.
  // Unlike the per-attempt path this does not require every
  // question to have an attempt: hitting Submit Set means the
  // student/trainee considers the set done, and unanswered items
  // render as Unanswered on the review page.
  const assignmentId: string | undefined =
    session.filter_criteria?.assignment_id;
  if (assignmentId) {
    try {
      await markAssignmentCompletedOnSubmit(supabase, user.id, assignmentId);
    } catch {
      // Best-effort. The session is already completed; the only
      // user-visible cost of a failure here is a stale completion
      // timestamp on the assignment junction.
    }
  }

  return { ok: true, sessionId };
}

/**
 * Mark a practice session as abandoned. No review report is
 * generated — the session just disappears from the in-progress
 * list. Existing attempts stay on the student's record (they
 * answered those questions, after all).
 */
export async function abandonPracticeSession(
  _prev: unknown,
  formData: FormData,
): Promise<SessionLifecycleResult> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
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
// Mark for review
// ──────────────────────────────────────────────────────────────

/**
 * Toggle mark-for-review on a single position inside a practice
 * session. Stores positions as int[] on practice_sessions; the
 * column was added in migration 20240101000037. Cheap, idempotent,
 * and uses an UPDATE with a SQL array operation so two clicks
 * from a flaky network can't drift the state.
 */
export async function togglePracticeMark(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: true; sessionId: string; position: number; marked: boolean } | { ok: false; error: string }> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const sessionId = String(formData.get('sessionId') ?? '');
  const position = Number(formData.get('position') ?? -1);
  if (!sessionId) return actionFail('sessionId required');
  if (!Number.isInteger(position) || position < 0) {
    return actionFail('position required');
  }

  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, status, marked_positions')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return actionFail('Session not found');
  if (session.user_id !== user.id) return actionFail('Session not found');
  if (session.status !== 'in_progress') {
    return actionFail('Session not in progress');
  }

  const current: number[] = Array.isArray(session.marked_positions)
    ? session.marked_positions
    : [];
  const isMarked = current.includes(position);
  const next = isMarked
    ? current.filter((p) => p !== position)
    : [...current, position];

  const { error } = await supabase
    .from('practice_sessions')
    .update({
      marked_positions: next,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .eq('status', 'in_progress');
  if (error) return actionFail(`Could not update mark: ${error.message}`);

  return { ok: true, sessionId, position, marked: !isMarked };
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
async function markAssignmentCompletedIfDone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  assignmentId: string,
): Promise<void> {
  const { data: assignment } = await supabase
    .from('assignments_v2')
    .select('id, assignment_type, question_ids')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return;
  if (assignment.assignment_type !== 'questions') return;

  const questionIds: string[] = Array.isArray(assignment.question_ids)
    ? assignment.question_ids
    : [];
  if (questionIds.length === 0) return;

  const { data: attempted } = await supabase
    .from('attempts')
    .select('question_id')
    .eq('user_id', userId)
    .in('question_id', questionIds);

  const distinct = new Set(
    ((attempted ?? []) as Array<{ question_id: string }>).map((r) => r.question_id),
  );
  if (distinct.size < questionIds.length) return;

  await supabase
    .from('assignment_students_v2')
    .update({ completed_at: new Date().toISOString() })
    .eq('assignment_id', assignmentId)
    .eq('student_id', userId)
    .is('completed_at', null);
}

// Submit Set companion to markAssignmentCompletedIfDone. The
// per-attempt helper above only flips completed_at when every
// question has been attempted and only on the first crossing —
// good for "auto-complete on the last answer" semantics. This
// helper is fired from submitPracticeSession when the set is
// explicitly submitted, so it always bumps completed_at to now,
// even if the student didn't answer everything and even if the
// assignment was already completed. That's how a re-do flows back
// into the same assignment slot: the latest submit wins.
async function markAssignmentCompletedOnSubmit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  assignmentId: string,
): Promise<void> {
  const { data: assignment } = await supabase
    .from('assignments_v2')
    .select('id, assignment_type')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return;
  if (assignment.assignment_type !== 'questions') return;

  await supabase
    .from('assignment_students_v2')
    .update({ completed_at: new Date().toISOString() })
    .eq('assignment_id', assignmentId)
    .eq('student_id', userId);
}

// MCQ grading against v2's object-shaped correct_answer:
//   { option_label: "B" }                     → single-answer
//   { option_labels: ["A","C"], option_label: null } → multi-answer
// Legacy shapes ("B" as a plain string, or ["A","C"] as a bare
// array) stay accepted for any row that still surfaces them.
function gradeMcqAnswer(selectedId: string, correct: unknown): boolean {
  if (correct == null) return false;
  if (typeof correct === 'string') return correct === selectedId;
  if (Array.isArray(correct)) return correct.map(String).includes(selectedId);
  if (typeof correct === 'object') {
    const obj = correct as { option_label?: unknown; option_labels?: unknown };
    if (typeof obj.option_label === 'string' && obj.option_label) {
      return obj.option_label === selectedId;
    }
    if (Array.isArray(obj.option_labels) && obj.option_labels.length > 0) {
      return obj.option_labels.map(String).includes(selectedId);
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

function normalizeText(s: unknown): string {
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
function gradeSprAnswer(responseText: string, correct: unknown): boolean {
  if (correct == null) return false;

  const acceptableTexts: string[] = [];
  let numericTarget: number | null = null;
  let tolerance = 0;

  if (typeof correct === 'string') {
    acceptableTexts.push(correct);
  } else if (Array.isArray(correct)) {
    for (const v of correct) acceptableTexts.push(String(v));
  } else if (typeof correct === 'object') {
    const obj = correct as {
      text?: unknown;
      number?: unknown;
      tolerance?: unknown;
    };
    if (typeof obj.text === 'string' && obj.text) {
      try {
        const parsed = JSON.parse(obj.text);
        if (Array.isArray(parsed)) {
          for (const v of parsed) acceptableTexts.push(String(v));
        } else {
          acceptableTexts.push(obj.text);
        }
      } catch {
        acceptableTexts.push(obj.text);
      }
    }
    if (typeof obj.number === 'number') {
      numericTarget = obj.number;
      acceptableTexts.push(String(obj.number));
    }
    if (typeof obj.tolerance === 'number') tolerance = obj.tolerance;
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
