// Server Actions for the ACT practice-tests hub (Phase 3 multi-section
// test mode).
//
// An ACT practice test is a virtual construct over act_questions
// sliced by source_test (docs/architecture-plan.md §3.4): no parallel
// act_practice_test_* family. The unit of work is one
// act_practice_test_attempts row per form attempt, created at start
// with the ordered section plan from lib/practice/act-test-plan.ts
// (ids per section, per-section time limit keyed by the form's format
// in act_forms, the break after Math). Each section then runs as its
// own practice_sessions row in the shared runner, in test mode.
//
//   startActPracticeTest  — build the plan and create the attempt
//                           (or resume the open attempt on that form);
//                           lands on the attempt page, where the
//                           student starts section 1.
//   startActSection       — open the attempt's current section: create
//                           its practice_sessions row with the deadline
//                           and redirect into the runner (or resume a
//                           section already in progress).
//   abandonActPracticeTest — give up on an in-progress attempt.
//
// Section completion (runner submit / timer expiry) and finalization
// live in lib/practice-test/act-attempt.ts, reached from
// submitPracticeSession and the attempt page.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import type { ActionResult } from '@/lib/types';
import { assessActQuestions } from '@/lib/practice/act-format-detection';
import { loadActFormQuestions } from '@/lib/practice/load-act-form-questions';
import { matchesActSectionPlan } from '@/lib/practice/act-assignment-scope';
import { isActSection, type ActSection } from '@/lib/practice/act-taxonomy';
import {
  buildSectionPlan,
  parsePlan,
  parseTimeMultiplier,
  parseSectionSelection,
  sectionOverdue,
  sectionDeadlineAt,
} from '@/lib/practice/act-test-plan';
import {
  attemptPath,
  attemptResultsPath,
  completeActSection,
  expireOverdueSection,
  finalizeActAttempt,
  loadOwnActAttempt,
} from '@/lib/practice-test/act-attempt';
import { loadTimeAccommodation } from '@/lib/practice/time-accommodation';

async function studentCtx() {
  try {
    const ctx = await requireUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ctx as { user: { id: string }; supabase: any };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Unexpected error loading user', 500);
  }
}

/**
 * Start an ACT practice test for the given form. Builds the section
 * plan and creates the attempt row, then redirects to the attempt
 * page (section 1's "before you begin" screen — the timer does not
 * start until the student starts the section). An attempt already in
 * progress on the same form and section scope is resumed instead of duplicated.
 */
export async function startActPracticeTest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  let ctx;
  try { ctx = await studentCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { user, supabase } = ctx;

  // Same per-user rate limit as the other practice-start paths so
  // tab-hopping can't bypass it.
  const rl = await rateLimit(`practice-start:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return actionFail('Too many session starts. Please wait and try again.');

  const sourceTest = String(formData.get('source_test') ?? '').trim();
  if (!sourceTest) return actionFail('Pick a test form.');
  let selectedSections: ActSection[] | undefined;
  try {
    selectedSections = parseSectionSelection(formData);
  } catch (error) {
    return actionFail(error instanceof Error ? error.message : 'Choose valid ACT sections.');
  }
  // An explicit field wins (the hub always sends one); a start with no
  // field — an assignment's Start button — uses the student's standing
  // accommodation from the Account page.
  const multiplierField = formData.get('time_multiplier');
  const multiplier = multiplierField == null
    ? await loadTimeAccommodation(supabase, user.id)
    : parseTimeMultiplier(multiplierField);
  const untimed = formData.get('timing_mode') === 'untimed';

  // The deterministic slice: every visible question of the form, in
  // source_ordinal order, bucketed by section.
  let questionRows;
  let formRow;
  try {
    const [questions, settings] = await Promise.all([
      loadActFormQuestions(supabase, sourceTest),
      supabase.from('act_forms').select('format, kind').eq('source_test', sourceTest).maybeSingle(),
    ]);
    if (settings.error) throw settings.error;
    questionRows = questions.data.sort((a, b) => (a.source_ordinal ?? 0) - (b.source_ordinal ?? 0));
    formRow = settings.data;
  } catch {
    return actionFail('Could not load ACT questions and format settings. Please retry.');
  }
  const detection = assessActQuestions(questionRows, formRow ?? {});
  if (!detection.format || detection.reviewReason) return actionFail('This ACT import needs admin review. ' + detection.reviewReason);

  const questionsBySection: Partial<Record<ActSection, string[]>> = {};
  for (const r of (questionRows ?? []) as Array<{ id: string; section: string }>) {
    if (!isActSection(r.section)) continue;
    (questionsBySection[r.section] ??= []).push(r.id);
  }
  const format = detection.format;
  let plan;
  try {
    plan = buildSectionPlan({ format, multiplier, questionsBySection, selectedSections, untimed });
  } catch (error) {
    return actionFail(error instanceof Error ? error.message : 'Could not select these sections.');
  }
  if (plan.length === 0) return actionFail('This test form has no questions yet.');

  const { data: open } = await supabase
    .from('act_practice_test_attempts')
    .select('id, sections')
    .eq('user_id', user.id)
    .eq('source_test', sourceTest)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false });
  const resumable = open?.find((attempt: { id: string; sections: unknown }) => matchesActSectionPlan(attempt.sections, plan));
  if (resumable?.id) redirect(attemptPath(resumable.id));

  const { data: attempt, error: insertErr } = await supabase
    .from('act_practice_test_attempts')
    .insert({
      user_id: user.id,
      source_test: sourceTest,
      status: 'in_progress',
      format,
      time_multiplier: multiplier,
      sections: plan,
      current_section_index: 0,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insertErr || !attempt) {
    return actionFail(`Failed to start test: ${insertErr?.message ?? 'unknown'}`);
  }

  redirect(attemptPath((attempt as { id: string }).id));
}

/**
 * Start (or resume) the attempt's current section. Creates the
 * section's practice_sessions row with its deadline and redirects
 * into the runner at position 0; a section already in progress is
 * resumed at its saved position, or closed and scored if its deadline
 * passed while the student was away.
 */
export async function startActSection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  let ctx;
  try { ctx = await studentCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { user, supabase } = ctx;

  const attemptId = String(formData.get('attempt_id') ?? '').trim();
  if (!attemptId) return actionFail('attempt_id required');
  const attempt = await loadOwnActAttempt(supabase, user.id, attemptId);
  if (!attempt) return actionFail('Test not found.');
  if (attempt.status === 'completed') redirect(attemptResultsPath(attemptId));
  if (attempt.status !== 'in_progress') return actionFail('This test was abandoned.');

  const plan = parsePlan(attempt.sections);
  if (plan.length === 0) return actionFail('This test has no section plan.');
  const idx = attempt.current_section_index ?? 0;
  const cur = plan[idx];

  let destination: string | null = null;

  if (!cur) {
    // Every section is done but the attempt never finalized.
    const fin = await finalizeActAttempt(supabase, attempt, plan);
    if (!fin.ok) return actionFail(fin.error);
    destination = attemptResultsPath(attemptId);
  } else if (cur.status === 'in_progress' && cur.session_id) {
    const overdue = sectionOverdue(cur);
    const { data: session } = await supabase
      .from('practice_sessions')
      .select('current_position, status')
      .eq('id', cur.session_id)
      .maybeSingle();
    if (overdue || session?.status !== 'in_progress') {
      const res = overdue
        ? await expireOverdueSection(supabase, user.id, cur)
        : await completeActSection(supabase, user.id, cur.session_id);
      if (!res.ok) return actionFail(res.error);
      destination = res.redirectTo;
    } else {
      destination = `/practice/s/${cur.session_id}/${session.current_position ?? 0}`;
    }
  } else if (cur.status !== 'pending') {
    destination = attemptPath(attemptId);
  } else {
    const startedAt = Date.now();
    const deadlineAt = sectionDeadlineAt(cur, startedAt);
    const { data: session, error: insertErr } = await supabase
      .from('practice_sessions')
      .insert({
        user_id: user.id,
        test_type: 'act',
        mode: 'practice',
        question_ids: cur.question_ids,
        current_position: 0,
        filter_criteria: {
          kind: 'practice_test',
          source_test: attempt.source_test,
          sectionsOnly: cur.section,
          deadlineAt,
          attempt_id: attemptId,
          section_index: cur.index,
          section_count: plan.length,
        },
      })
      .select('id')
      .single();
    if (insertErr || !session) {
      return actionFail(`Failed to start section: ${insertErr?.message ?? 'unknown'}`);
    }
    const sessionId = (session as { id: string }).id;
    plan[idx] = {
      ...cur,
      status: 'in_progress',
      session_id: sessionId,
      started_at: new Date(startedAt).toISOString(),
      deadline_at: deadlineAt,
    };
    const { data: updated, error: updErr } = await supabase
      .from('act_practice_test_attempts')
      .update({ sections: plan, updated_at: new Date().toISOString() })
      .eq('id', attemptId)
      .eq('status', 'in_progress')
      .select('id');
    if (updErr || !updated || updated.length === 0) {
      // Don't leave an orphan timed session behind.
      await supabase.from('practice_sessions').delete().eq('id', sessionId);
      return actionFail(updErr?.message ?? 'Attempt is no longer in progress');
    }
    destination = `/practice/s/${sessionId}/0`;
  }

  redirect(destination);
}

/** Give up on an in-progress attempt: the attempt and its current
 *  section session are marked abandoned; answers already recorded
 *  stay on the student's record. */
export async function abandonActPracticeTest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await studentCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { user, supabase } = ctx;

  const attemptId = String(formData.get('attempt_id') ?? '').trim();
  if (!attemptId) return actionFail('attempt_id required');
  const attempt = await loadOwnActAttempt(supabase, user.id, attemptId);
  if (!attempt) return actionFail('Test not found.');
  if (attempt.status !== 'in_progress') return actionOk();

  const now = new Date().toISOString();
  const plan = parsePlan(attempt.sections);
  const cur = plan[attempt.current_section_index ?? 0];
  if (cur?.session_id) {
    await supabase
      .from('practice_sessions')
      .update({ status: 'abandoned', last_activity_at: now })
      .eq('id', cur.session_id)
      .eq('status', 'in_progress');
  }
  const { data: updated, error } = await supabase
    .from('act_practice_test_attempts')
    .update({ status: 'abandoned', finished_at: now, updated_at: now })
    .eq('id', attemptId)
    .eq('status', 'in_progress')
    .select('id');
  if (error) return actionFail(error.message);
  if (!updated || updated.length === 0) return actionFail('Test is no longer in progress.');
  return actionOk();
}
