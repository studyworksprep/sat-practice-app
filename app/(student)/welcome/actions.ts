// Server Actions for the onboarding intake (docs/student-onboarding-and-
// plan-redesign-2026-09.md §3). One verb per step — situation, targets,
// availability, self-assessment — plus build, activate, and "set aside".
// Each is a thin RLS-scoped write to profiles / student_intake; the page
// derives the current step from data, so nothing here tracks wizard
// state. Any answer change deletes the draft plan (it was built from the
// old answers) so the ladder lands on "build" again.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { logger } from '@/lib/api/logger';
import { generateStudyPlan, activatePlan } from '@/lib/plan/plan-actions';
import {
  SAT_DOMAIN_CODES,
  deriveMode,
  isIntent,
  isPrepLevel,
  parseIntakeRow,
} from '@/lib/plan/intake';
import { findSkill } from '@/lib/practice/sat-taxonomy';
import type { ActionResult } from '@/lib/types';
import type { Json } from '@/lib/types/database';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = Awaited<ReturnType<typeof requireUser>>;

async function requireStudent(): Promise<Ctx> {
  const ctx = await requireUser();
  if (ctx.profile?.is_demo) throw new ApiError('Demo accounts are read-only', 403);
  return ctx;
}

function asFail(err: unknown): ActionResult {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail('Unexpected error');
}

/** Upsert the caller's intake row with a partial patch. */
async function patchIntake(
  ctx: Ctx,
  patch: Record<string, Json | null | undefined>,
): Promise<string | null> {
  const { error } = await ctx.supabase
    .from('student_intake')
    .upsert({ student_id: ctx.user.id, ...patch }, { onConflict: 'student_id' });
  return error ? error.message : null;
}

/** Answers changed → the draft built from the old answers is stale. */
async function dropDraft(ctx: Ctx): Promise<void> {
  await ctx.supabase
    .from('study_plans')
    .delete()
    .eq('student_id', ctx.user.id)
    .eq('test_type', 'sat')
    .eq('status', 'draft');
}

// ── Step 1: situation ─────────────────────────────────────────────

export async function saveSituationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const { user, supabase } = ctx;

  const target = Number(fd.get('target'));
  const testDate = String(fd.get('testDate') ?? '');
  const prepLevel = fd.get('prepLevel');
  const intent = fd.get('intent');
  if (!Number.isFinite(target) || target < 400 || target > 1600 || target % 10 !== 0) {
    return actionFail('Pick a target between 400 and 1600 (multiples of 10).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) return actionFail('Pick your test date.');
  const today = new Date().toISOString().slice(0, 10);
  if (testDate <= today) return actionFail('Your test date needs to be in the future.');
  if (!isPrepLevel(prepLevel)) return actionFail('Tell us how much prep you have done so far.');
  if (!isIntent(intent)) return actionFail('Pick how you want the plan to work.');

  // Self-update rides RLS — same columns the dashboard tiles edit.
  const { error } = await supabase
    .from('profiles')
    .update({ target_sat_score: target, sat_test_date: testDate })
    .eq('id', user.id);
  if (error) return actionFail(error.message);

  const intakeErr = await patchIntake(ctx, {
    prep_level: prepLevel,
    intent,
    // Switching away from own-targets clears the picks so a later
    // switch back starts clean.
    ...(intent === 'guide_me' ? { targets: [] } : {}),
  });
  if (intakeErr) return actionFail(intakeErr);

  await dropDraft(ctx);
  revalidatePath('/welcome');
  return { ok: true };
}

// ── Step 2: targets (own_targets only) ────────────────────────────

export async function saveTargetsAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }

  const picks = fd
    .getAll('skill')
    .map((v) => String(v))
    .map((v) => {
      const [domainCode, skillCode] = v.split('|');
      return { domainCode, skillCode };
    })
    .filter((p) => p.domainCode && p.skillCode && findSkill(p.domainCode, p.skillCode));
  if (picks.length === 0) return actionFail('Pick at least one skill to work on.');

  const intakeErr = await patchIntake(ctx, {
    targets: picks.map((p) => ({ domain_code: p.domainCode, skill_code: p.skillCode })),
    full_tests: fd.get('fullTests') != null,
  });
  if (intakeErr) return actionFail(intakeErr);

  await dropDraft(ctx);
  revalidatePath('/welcome');
  return { ok: true };
}

// ── Step 3: availability ──────────────────────────────────────────

export async function saveAvailabilityAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }

  const weeklyHours = Number(fd.get('weeklyHours'));
  if (!Number.isFinite(weeklyHours) || weeklyHours < 1 || weeklyHours > 40) {
    return actionFail('Weekly hours must be between 1 and 40.');
  }
  const days = [
    ...new Set(
      fd
        .getAll('day')
        .map((v) => Number(v))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
    ),
  ].sort((a, b) => a - b);
  if (days.length === 0) return actionFail('Pick at least one day you can study.');

  const intakeErr = await patchIntake(ctx, { weekly_hours: weeklyHours, study_days: days });
  if (intakeErr) return actionFail(intakeErr);

  await dropDraft(ctx);
  revalidatePath('/welcome');
  return { ok: true };
}

// ── Step 4: self-assessment → build ───────────────────────────────

export async function saveAssessmentAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }

  const rating: Record<string, number> = {};
  for (const code of SAT_DOMAIN_CODES) {
    const r = Number(fd.get(`rating_${code}`));
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return actionFail('Rate every area from 1 to 5 — there are no wrong answers.');
    }
    rating[code] = r;
  }
  const intakeErr = await patchIntake(ctx, { self_rating: rating });
  if (intakeErr) return actionFail(intakeErr);

  await dropDraft(ctx);
  const built = await buildFromIntake(ctx);
  revalidatePath('/welcome');
  return built;
}

// ── Build (and rebuild) ───────────────────────────────────────────

export async function buildPlanAction(
  _prev: ActionResult | null,
  _fd: FormData,
): Promise<ActionResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const built = await buildFromIntake(ctx);
  revalidatePath('/welcome');
  return built;
}

/** Generate the draft from the profile + intake row. Shared by the
 *  assessment step (auto-build) and the explicit build/rebuild button. */
async function buildFromIntake(ctx: Ctx): Promise<ActionResult> {
  const { user, supabase } = ctx;

  const [{ data: profile }, { data: intakeRow }] = await Promise.all([
    supabase
      .from('profiles')
      .select('target_sat_score, sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('student_intake')
      .select('prep_level, intent, targets, weekly_hours, study_days, self_rating, full_tests, completed_at, skipped_at')
      .eq('student_id', user.id)
      .maybeSingle(),
  ]);
  const intake = parseIntakeRow(intakeRow);
  if (!profile?.target_sat_score || !profile?.sat_test_date) {
    return actionFail('Set your target score and test date first.');
  }
  if (!intake.prepLevel || !intake.intent || !intake.weeklyHours || !intake.studyDays) {
    return actionFail('A few answers are missing — go back a step.');
  }
  if (intake.intent === 'own_targets' && intake.targets.length === 0) {
    return actionFail('Pick at least one skill to work on.');
  }
  // sat_test_date can come back as a full timestamp — the generator
  // validates a bare yyyy-mm-dd.
  const testDate = String(profile.sat_test_date).slice(0, 10);

  // Fold any practice the student has already done into the mastery
  // snapshot so the plan reflects it. Best-effort: a failure degrades
  // the plan's inputs, it must not block plan creation.
  const { error: snapErr } = await supabase.rpc('snapshot_student_skill_mastery', {
    p_student: user.id,
  });
  if (snapErr) {
    logger.warn(
      { event: 'welcome_snapshot_failed', user_id: user.id, error: snapErr.message },
      'welcome_snapshot_failed',
    );
  }

  const res = await generateStudyPlan({
    goalScore: profile.target_sat_score,
    testDate,
    weeklyHours: intake.weeklyHours,
    mode: deriveMode(intake.prepLevel, intake.intent),
    prepLevel: intake.prepLevel,
    intent: intake.intent,
    studyDays: intake.studyDays,
    targets: intake.targets.map((t) => t.skillCode),
    fullTests: intake.fullTests,
    selfRating: intake.selfRating as Record<string, number> | null,
  });
  return res.ok ? { ok: true } : res;
}

// ── Activate ──────────────────────────────────────────────────────

export async function activateFirstPlanAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }

  const planId = String(fd.get('planId') ?? '');
  if (!UUID_RE.test(planId)) return actionFail('Invalid plan.');
  const res = await activatePlan(planId);
  if (!res.ok) return res;

  // The sidebar's Today anchor is decided in the student layout, which
  // a soft redirect would not re-render — invalidate the layout so the
  // student lands on Today with Today in the nav.
  revalidatePath('/', 'layout');

  const intakeErr = await patchIntake(ctx, { completed_at: new Date().toISOString() });
  if (intakeErr) {
    // The plan is live; a missing completion stamp only affects login
    // routing, which the active plan already short-circuits.
    logger.warn(
      { event: 'welcome_intake_complete_failed', user_id: ctx.user.id, error: intakeErr },
      'welcome_intake_complete_failed',
    );
  }
  redirect('/today');
}

// ── Set aside ─────────────────────────────────────────────────────

/** "I'll do this later": stop routing this student to /welcome on
 *  login. The dashboard callout stays as the way back in. */
export async function setAsideAction(
  _prev: ActionResult | null,
  _fd: FormData,
): Promise<ActionResult> {
  let ctx: Ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const intakeErr = await patchIntake(ctx, { skipped_at: new Date().toISOString() });
  if (intakeErr) return actionFail(intakeErr);
  redirect('/dashboard');
}
