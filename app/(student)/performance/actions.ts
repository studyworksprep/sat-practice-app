// Server Actions for the student's "Test dates & scores" tab on
// /performance. A student keeps their own list of SAT test dates and
// official SAT/PSAT scores, and picks which date they are studying for.
//
// Rows a student adds are self-reported (created_by = their own id; see
// lib/practice/official-tests.ts). The database lets a student insert
// only self-reported rows for themselves and delete only those
// (migration 20261115210000), so a tutor-entered row is never
// removable from here.
//
// "Studying for" is profiles.sat_test_date, which the welcome wizard
// builds the first plan from. Choosing a date also moves an active SAT
// plan to it and re-paces the remaining weeks, the same as the plan
// hub's Adjust (app/(student)/plan/actions.ts).

'use server';

import { revalidatePath } from 'next/cache';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { regenerateRemainingTasks } from '@/lib/plan/repace-runner';
import {
  addDays,
  calendarDay,
  EARLIEST_SCORE_DATE,
  isDuplicateError,
  isIsoDate,
  MAX_DAYS_AHEAD,
  parseTestType,
  validateSectionScores,
  withArticle,
} from '@/lib/practice/official-tests';
import { formatCalendarDate } from '@/lib/formatters';
import type { ActionResult, AuthContext, Fail } from '@/lib/types';

/** Result of the verbs that can move the student's plan. */
export type PlanMoveResult = ActionResult<{ data: { planMoved: boolean } }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireStudentWriter(): Promise<AuthContext> {
  const ctx = await requireRole(['student', 'practice']);
  assertWriter(ctx);
  return ctx;
}

function asFail(err: unknown): Fail {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail('Unexpected error');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function revalidateSurfaces() {
  revalidatePath('/performance');
  revalidatePath('/dashboard');
  revalidatePath('/plan');
  revalidatePath('/account');
}

/** Make `testDate` the date the student studies for: the profile date,
 *  and the active SAT plan's date with its remaining weeks re-paced.
 *  Returns whether a plan moved, or an error message. */
async function studyFor(
  ctx: AuthContext,
  testDate: string,
  today: string,
): Promise<{ planMoved: boolean } | { error: string }> {
  const { user, supabase } = ctx;

  const { error: profErr } = await supabase
    .from('profiles')
    .update({ sat_test_date: testDate })
    .eq('id', user.id);
  if (profErr) return { error: profErr.message };

  const { data: plan } = await supabase
    .from('study_plans')
    .select('id, test_date')
    .eq('student_id', user.id)
    .eq('test_type', 'sat')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (!plan || calendarDay(plan.test_date) === testDate) return { planMoved: false };

  const { error: planErr } = await supabase
    .from('study_plans')
    .update({ test_date: testDate })
    .eq('id', plan.id);
  if (planErr) return { error: planErr.message };

  const res = await regenerateRemainingTasks(supabase, { planId: plan.id, today });
  if (!res.ok) return { error: res.error };

  logger.info(
    { event: 'plan_test_date_moved', user_id: user.id, plan_id: plan.id, testDate, source: 'test_dates' },
    'plan_test_date_moved',
  );
  return { planMoved: true };
}

/** A test date must be a real day from today up to MAX_DAYS_AHEAD. */
function checkUpcomingDate(raw: unknown, today: string): string | { error: string } {
  if (!isIsoDate(raw)) return { error: 'Pick a test date.' };
  if (raw < today) return { error: 'That date has passed. Add past tests as scores instead.' };
  if (raw > addDays(today, MAX_DAYS_AHEAD)) return { error: 'That date is too far ahead. Check the year.' };
  return raw;
}

// ── Test dates ────────────────────────────────────────────────────

export async function addTestDateAction(
  _prev: PlanMoveResult | null,
  fd: FormData,
): Promise<PlanMoveResult> {
  let ctx: AuthContext;
  try {
    ctx = await requireStudentWriter();
  } catch (err) {
    return asFail(err);
  }
  const today = todayIso();
  const checked = checkUpcomingDate(fd.get('test_date'), today);
  if (typeof checked !== 'string') return actionFail(checked.error);
  const testDate = checked;
  const studying = fd.get('studying_for') === 'on';
  if (studying && testDate <= today) {
    return actionFail('Pick a date after today to study for.');
  }

  const { error } = await ctx.supabase
    .from('sat_test_registrations')
    .insert({ student_id: ctx.user.id, test_date: testDate, created_by: ctx.user.id });
  // Already on the list (perhaps added by a tutor) is fine when the
  // student only wants to study for it.
  if (error && !(isDuplicateError(error) && studying)) {
    return actionFail(
      isDuplicateError(error)
        ? `${formatCalendarDate(testDate)} is already on your list.`
        : error.message,
    );
  }

  let planMoved = false;
  if (studying) {
    const res = await studyFor(ctx, testDate, today);
    if ('error' in res) return actionFail(`Date saved, but your plan didn't update: ${res.error}`);
    planMoved = res.planMoved;
  }

  revalidateSurfaces();
  return actionOk({ planMoved });
}

export async function studyForDateAction(
  _prev: PlanMoveResult | null,
  fd: FormData,
): Promise<PlanMoveResult> {
  let ctx: AuthContext;
  try {
    ctx = await requireStudentWriter();
  } catch (err) {
    return asFail(err);
  }
  const today = todayIso();
  const checked = checkUpcomingDate(fd.get('test_date'), today);
  if (typeof checked !== 'string') return actionFail(checked.error);
  if (checked <= today) return actionFail('Pick a date after today to study for.');

  const res = await studyFor(ctx, checked, today);
  if ('error' in res) return actionFail(res.error);

  revalidateSurfaces();
  return actionOk({ planMoved: res.planMoved });
}

export async function removeTestDateAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: AuthContext;
  try {
    ctx = await requireStudentWriter();
  } catch (err) {
    return asFail(err);
  }
  const id = String(fd.get('id') ?? '');
  if (!UUID_RE.test(id)) return actionFail('Missing test date.');

  const { data, error } = await ctx.supabase
    .from('sat_test_registrations')
    .delete()
    .eq('id', id)
    .eq('student_id', ctx.user.id)
    .eq('created_by', ctx.user.id)
    .select('id');
  if (error) return actionFail(error.message);
  if (!data || data.length === 0) {
    return actionFail('Only dates you added can be removed. Ask your tutor about this one.');
  }

  revalidateSurfaces();
  return actionOk({ id });
}

// ── Official scores ───────────────────────────────────────────────

export async function addOfficialScoreAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: AuthContext;
  try {
    ctx = await requireStudentWriter();
  } catch (err) {
    return asFail(err);
  }
  const today = todayIso();
  const testDate = fd.get('test_date');
  if (!isIsoDate(testDate)) return actionFail('Pick the date you took the test.');
  if (testDate > today) return actionFail('That date is still ahead. Add it as a test date instead.');
  if (testDate < EARLIEST_SCORE_DATE) return actionFail('That date is too far back. Check the year.');

  const testType = parseTestType(fd.get('test_type'));
  const rw = Number(fd.get('rw_score'));
  const math = Number(fd.get('math_score'));
  const invalid = validateSectionScores(testType, rw, math);
  if (invalid) return actionFail(invalid);

  const { error } = await ctx.supabase.from('sat_official_scores').insert({
    student_id: ctx.user.id,
    test_date: testDate,
    test_type: testType,
    rw_score: rw,
    math_score: math,
    composite_score: rw + math,
    created_by: ctx.user.id,
  });
  if (error) {
    return actionFail(
      isDuplicateError(error)
        ? `You already have ${withArticle(testType)} score for ${formatCalendarDate(testDate)}.`
        : error.message,
    );
  }

  revalidateSurfaces();
  return actionOk();
}

export async function removeOfficialScoreAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: AuthContext;
  try {
    ctx = await requireStudentWriter();
  } catch (err) {
    return asFail(err);
  }
  const id = String(fd.get('id') ?? '');
  if (!UUID_RE.test(id)) return actionFail('Missing score.');

  const { data, error } = await ctx.supabase
    .from('sat_official_scores')
    .delete()
    .eq('id', id)
    .eq('student_id', ctx.user.id)
    .eq('created_by', ctx.user.id)
    .select('id');
  if (error) return actionFail(error.message);
  if (!data || data.length === 0) {
    return actionFail('Only scores you added can be removed. Ask your tutor about this one.');
  }

  revalidateSurfaces();
  return actionOk({ id });
}
