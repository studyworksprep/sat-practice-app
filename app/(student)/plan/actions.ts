// Server Actions for the student plan hub (docs/student-onboarding-and-
// plan-redesign-2026-09.md §6.2 "Adjust"). Two verbs over the student's
// own ACTIVE plan: adjust (target, test date, hours, days → regenerate
// the remaining weeks in place) and rebuild (regenerate from current
// evidence, same answers). Both keep the plan id, completed history,
// and human-authored tasks — regenerateRemainingTasks replaces only the
// still-pending generated tasks from today onward.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { regenerateRemainingTasks } from '@/lib/plan/repace-runner';
import type { ActionResult } from '@/lib/types';
import type { Json } from '@/lib/types/database';

type Ctx = Awaited<ReturnType<typeof requireUser>>;

export type AdjustResult = ActionResult<{ taskCount: number; weeks: number }>;

async function requireStudent(): Promise<Ctx> {
  const ctx = await requireUser();
  if (ctx.profile?.is_demo) throw new ApiError('Demo accounts are read-only', 403);
  return ctx;
}

function asFail(err: unknown): AdjustResult {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail('Unexpected error');
}

async function loadOwnActivePlan(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from('study_plans')
    .select('id, config, goal_score, test_date')
    .eq('student_id', ctx.user.id)
    .eq('status', 'active')
    .order('test_type', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

function revalidateSurfaces() {
  revalidatePath('/plan');
  revalidatePath('/dashboard');
}

export async function adjustPlanAction(
  _prev: AdjustResult | null,
  fd: FormData,
): Promise<AdjustResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const { user, supabase } = ctx;

  const target = Number(fd.get('target'));
  const testDate = String(fd.get('testDate') ?? '');
  const weeklyHours = Number(fd.get('weeklyHours'));
  const days = [
    ...new Set(
      fd
        .getAll('day')
        .map((v) => Number(v))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);
  const today = new Date().toISOString().slice(0, 10);

  if (!Number.isFinite(target) || target < 400 || target > 1600 || target % 10 !== 0) {
    return actionFail('Pick a score between 400 and 1600, in steps of 10.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) return actionFail('Pick your test date.');
  if (testDate <= today) return actionFail('That date has passed — pick one in the future.');
  if (!Number.isFinite(weeklyHours) || weeklyHours < 1 || weeklyHours > 40) {
    return actionFail('Pick a number of hours between 1 and 40.');
  }
  if (days.length === 0) return actionFail('Pick at least one day.');

  const plan = await loadOwnActivePlan(ctx);
  if (!plan) return actionFail('No active plan to adjust.');

  // Profile mirrors (the dashboard tiles and sidebar footer read these).
  const { error: profErr } = await supabase
    .from('profiles')
    .update({ target_sat_score: target, sat_test_date: testDate })
    .eq('id', user.id);
  if (profErr) return actionFail(profErr.message);

  const config = {
    ...((plan.config && typeof plan.config === 'object' && !Array.isArray(plan.config)
      ? (plan.config as Record<string, unknown>)
      : {}) as Record<string, unknown>),
    weekly_hours: weeklyHours,
    study_days: days,
  };
  const { error: planErr } = await supabase
    .from('study_plans')
    .update({ goal_score: target, test_date: testDate, config: config as unknown as Json })
    .eq('id', plan.id);
  if (planErr) return actionFail(planErr.message);

  // Keep the intake in step so a future rebuild from the wizard agrees.
  await supabase
    .from('student_intake')
    .upsert({ student_id: user.id, weekly_hours: weeklyHours, study_days: days }, { onConflict: 'student_id' });

  const res = await regenerateRemainingTasks(supabase, { planId: plan.id, today });
  if (!res.ok) return actionFail(res.error);

  logger.info(
    { event: 'plan_adjusted', user_id: user.id, plan_id: plan.id, target, testDate, weeklyHours, days },
    'plan_adjusted',
  );
  revalidateSurfaces();
  return { ok: true, taskCount: res.taskCount, weeks: res.weeks };
}

export async function rebuildPlanAction(
  _prev: AdjustResult | null,
  _fd: FormData,
): Promise<AdjustResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const { user, supabase } = ctx;

  const plan = await loadOwnActivePlan(ctx);
  if (!plan) return actionFail('No active plan to rebuild.');

  // Fold the latest practice into the mastery snapshot first so the
  // rebuild sees it. Best-effort, same as the wizard.
  const { error: snapErr } = await supabase.rpc('snapshot_student_skill_mastery', {
    p_student: user.id,
  });
  if (snapErr) {
    logger.warn(
      { event: 'plan_rebuild_snapshot_failed', user_id: user.id, error: snapErr.message },
      'plan_rebuild_snapshot_failed',
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const res = await regenerateRemainingTasks(supabase, { planId: plan.id, today });
  if (!res.ok) return actionFail(res.error);

  logger.info({ event: 'plan_rebuilt', user_id: user.id, plan_id: plan.id }, 'plan_rebuilt');
  revalidateSurfaces();
  return { ok: true, taskCount: res.taskCount, weeks: res.weeks };
}
