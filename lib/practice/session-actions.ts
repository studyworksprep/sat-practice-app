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

import { after } from 'next/server';
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

type SessionLifecycleResult = ActionResult<{
  sessionId: string;
  // Set on ACT practice-test submits — the runner client uses this
  // to route to the ACT results page rather than the standard
  // session-review page.
  actAttemptId?: string | null;
}>;

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
  //
  // Rate limit (120 submits/min per user — a real student does ~1
  // every 30–180s) runs concurrently with the session fetch: both are
  // network round-trips with no data dependency, and nothing is
  // written until both have resolved.
  const [rl, { data: session, error: sessionErr }] = await Promise.all([
    rateLimit(`practice-submit:${user.id}`, { limit: 120, windowMs: 60_000 }),
    supabase
      .from('practice_sessions')
      .select('id, user_id, question_ids, filter_criteria, created_at, test_type')
      .eq('id', sessionId)
      .maybeSingle(),
  ]);
  if (!rl.ok) {
    return actionFail('Too many submissions. Please slow down.');
  }
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
    // Grade lookup, rationale fetch, and the first-attempt check all
    // key off questionId alone — run them concurrently.
    const [grade, { data: questionRow }, { data: existing }] = await Promise.all([
      gradeActMcq(supabase, questionId, String(selectedOptionId)),
      supabase
        .from('act_questions')
        .select('rationale_html')
        .eq('id', questionId)
        .maybeSingle(),
      supabase
        .from('act_attempts')
        .select('id')
        .eq('user_id', user.id)
        .eq('question_id', questionId)
        .gte('created_at', sessionFloor)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    isCorrect = grade.isCorrect;
    correctOptionIdOut = grade.correctOptionId;

    if (!questionRow) return actionFail('Question not found');
    rationaleHtml = applyWatermark(
      (questionRow as { rationale_html: string | null }).rationale_html ?? '',
      user.id,
    );

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
    // rationale_html + correct_answer (jsonb) all live on the single
    // row. The first-attempt-wins check needs only questionId, so it
    // runs concurrently with the question fetch.
    const [{ data: question }, { data: existing }] = await Promise.all([
      supabase
        .from('questions_v2')
        .select('question_type, rationale_html, correct_answer')
        .eq('id', questionId)
        .maybeSingle(),
      supabase
        .from('attempts')
        .select('id')
        .eq('user_id', user.id)
        .eq('question_id', questionId)
        .gte('created_at', sessionFloor)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
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

    // First-attempt-wins inside the session window (checked above,
    // concurrently with the question fetch).
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
  }

  // Assignment auto-completion. SAT-only path today — ACT assignments
  // are forward-wired but no surface ships yet, so markAssignment...
  // is keyed off the SAT attempts table.
  //
  // Deferred via after(): this bookkeeping chain is 4 more DB
  // round-trips and the student's Correct/Incorrect feedback must not
  // wait on it. It was already best-effort (errors swallowed);
  // after() keeps the same semantics but runs it once the response
  // has been sent.
  if (!isAct) {
    const assignmentId: string | undefined = session.filter_criteria?.assignment_id;
    if (assignmentId) {
      after(async () => {
        try {
          await markAssignmentCompletedIfDone(supabase, user.id, assignmentId, sessionFloor);
        } catch {
          // Swallow — the student's attempt is recorded either way.
        }
      });
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
    .select('id, user_id, status, filter_criteria, test_type')
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
    // Deferred via after() — 3 DB round-trips of bookkeeping the
    // student's redirect-to-report must not wait on. Same best-effort
    // semantics as before, just off the critical path.
    after(async () => {
      try {
        await markAssignmentCompletedOnSubmit(supabase, user.id, assignmentId);
      } catch {
        // Best-effort. The session is already completed; the only
        // user-visible cost of a failure here is a stale completion
        // timestamp on the assignment junction.
      }
    });
  }

  // ACT practice tests: cache the scaled-score snapshot to
  // act_practice_test_attempts. The runner client checks for
  // `actAttemptId` on the result and routes the student to the
  // ACT results page when present. See docs/architecture-plan.md
  // §3.4 "ACT practice tests as virtual constructs."
  let actAttemptId: string | null = null;
  if (
    session.test_type === 'act'
    && session.filter_criteria?.kind === 'practice_test'
  ) {
    try {
      const { finalizeActPracticeTest } = await import(
        '@/app/(student)/practice/tests/actions'
      );
      const res = await finalizeActPracticeTest(supabase, user.id, sessionId);
      if (res.ok) actAttemptId = res.attemptId;
    } catch {
      // Best-effort. The session is completed; the worst case is the
      // student lands on the regular session-review page instead of
      // the ACT results page until they re-submit.
    }
  }

  return { ok: true, sessionId, actAttemptId };
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
// question in the assignment's question_ids, made within the current
// assignment-attempt window (created_at >= sessionFloor). Order-
// independent, so skipping around or returning later both work
// correctly.
//
// The window floor is essential, not cosmetic. An assignment session
// is a "fresh attempt": the runner scopes a question's saved answer to
// session.created_at (load-question.ts: `since = sessionCreatedAt`),
// and submitAttempt records a new attempt per session window for the
// same reason. If completion counted all-time attempts instead, a
// student who had already practiced these questions elsewhere would
// trip completion on their first in-session answer — which flips the
// in_progress session to 'completed' via closeOpenSessionsForAssignment.
// Continue then can't find an in_progress session to resume, mints a
// fresh one, and every in-window answer falls below the new floor:
// the whole assignment renders undone. Scoping the count to the
// session floor keeps this detector in agreement with what the student
// actually answered in this attempt.
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
  sessionFloor: string,
): Promise<void> {
  const { data: assignment } = await supabase
    .from('assignments_v2')
    .select('id, assignment_type, question_ids')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return;
  // lesson_pack materializes its pack's question_ids into the same
  // column at creation and is started / displayed / progressed exactly
  // like a 'questions' assignment everywhere else (start action, detail
  // page, list page). Gate completion on the same pair so a finished
  // lesson_pack actually records completed_at — otherwise it stays
  // "pending" forever, the detail CTA stays "Continue" instead of
  // flipping to "Redo" + "View report", and Continue mints a fresh
  // blank session past the answers' created_at floor.
  if (assignment.assignment_type !== 'questions'
      && assignment.assignment_type !== 'lesson_pack') return;

  const questionIds: string[] = Array.isArray(assignment.question_ids)
    ? assignment.question_ids
    : [];
  if (questionIds.length === 0) return;

  const { data: attempted } = await supabase
    .from('attempts')
    .select('question_id')
    .eq('user_id', userId)
    .in('question_id', questionIds)
    .gte('created_at', sessionFloor);

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

  await closeOpenSessionsForAssignment(supabase, userId, assignmentId);
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
  // lesson_pack is treated like 'questions' everywhere else; include it
  // here too so Submit Set stamps completed_at (and closes the session)
  // for a finished lesson_pack. See markAssignmentCompletedIfDone.
  if (assignment.assignment_type !== 'questions'
      && assignment.assignment_type !== 'lesson_pack') return;

  await supabase
    .from('assignment_students_v2')
    .update({ completed_at: new Date().toISOString() })
    .eq('assignment_id', assignmentId)
    .eq('student_id', userId);

  await closeOpenSessionsForAssignment(supabase, userId, assignmentId);
}

// Flip every in_progress practice_session for this (user, assignment)
// to completed. Called by both completion-marker paths above so the
// session table can't lag the assignment table. Without this, an
// assignment row's completed_at can be set while a sibling session
// stays in_progress, which the tutor students page treats as "report
// not ready" and hides the deep-link.
async function closeOpenSessionsForAssignment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  assignmentId: string,
): Promise<void> {
  await supabase
    .from('practice_sessions')
    .update({
      status: 'completed',
      last_activity_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .eq('filter_criteria->>assignment_id', assignmentId);
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

// Strict numeric parser for SPR grading. Unlike parseFloat, this
// rejects trailing garbage — parseFloat("23/60") returns 23, which
// used to make "23/90" collide with "23/60" in the numeric fallback
// below. Fraction strings like "a/b" are evaluated as a/b when both
// sides are pure numbers; anything else that isn't a valid Number
// returns NaN.
function toStrictNumber(s: unknown): number {
  const str = (s ?? '').toString().trim();
  if (!str) return NaN;
  const frac = str.match(/^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
    return NaN;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : NaN;
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

  const responseNum = toStrictNumber(responseText);
  if (Number.isFinite(responseNum)) {
    if (numericTarget != null && Math.abs(responseNum - numericTarget) <= tolerance) {
      return true;
    }
    for (const entry of acceptableTexts) {
      const entryNum = toStrictNumber(entry);
      if (Number.isFinite(entryNum) && Math.abs(responseNum - entryNum) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}
