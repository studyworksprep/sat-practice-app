// Server Actions for the first-run wizard (§6.4). Four verbs, one per
// wizard step: save the goal, start (or later resume) the short
// diagnostic, generate the first plan, activate it. Each is a thin
// RLS-scoped write — the wizard page derives the current step from
// data, so these actions never track wizard state themselves.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { logger } from '@/lib/api/logger';
import { selectDiagnosticQuestions } from '@/lib/plan/diagnostic';
import { generateStudyPlan, activatePlan } from '@/lib/plan/plan-actions';
import type { DiagnosticCandidate } from '@/lib/plan/diagnostic';
import type { ActionResult } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireStudent() {
  const ctx = await requireUser();
  if (ctx.profile?.is_demo) throw new ApiError('Demo accounts are read-only', 403);
  return ctx;
}

function asFail(err: unknown): ActionResult {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail('Unexpected error');
}

// ── Step 1: goal + test date ──────────────────────────────────────

export async function saveGoalAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const { user, supabase } = ctx;

  const target = Number(fd.get('target'));
  const testDate = String(fd.get('testDate') ?? '');
  if (!Number.isFinite(target) || target < 400 || target > 1600 || target % 10 !== 0) {
    return actionFail('Pick a target between 400 and 1600 (multiples of 10).');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    return actionFail('Pick your test date.');
  }
  const today = new Date().toISOString().slice(0, 10);
  if (testDate <= today) {
    return actionFail('Your test date needs to be in the future.');
  }

  // Self-update rides RLS (a student may edit their own profile row) —
  // same columns the dashboard's target-score / test-date tiles edit.
  const { error } = await supabase
    .from('profiles')
    .update({ target_sat_score: target, sat_test_date: testDate })
    .eq('id', user.id);
  if (error) return actionFail(error.message);

  revalidatePath('/welcome');
  return { ok: true };
}

// ── Step 2: the short diagnostic ──────────────────────────────────

export async function startDiagnosticAction(
  _prev: ActionResult | null,
  _fd: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const { user, supabase } = ctx;

  // Same key as the practice launcher so the two share one budget.
  const rl = await rateLimit(`practice-start:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return actionFail('Too many session starts. Please wait and try again.');

  // Resume an open diagnostic instead of minting a second one.
  const { data: open } = await supabase
    .from('practice_sessions')
    .select('id, current_position')
    .eq('user_id', user.id)
    .eq('status', 'in_progress')
    .contains('filter_criteria', { diagnostic: true })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) redirect(`/practice/s/${open.id}/${open.current_position ?? 0}`);

  // Candidate pool: id + domain + difficulty across the published bank.
  // ~3.4k rows of three narrow columns — same order of magnitude the
  // practice launcher's count path already pulls.
  const { data: rows, error: qErr } = await supabase
    .from('questions_v2')
    .select('id, domain_code, difficulty')
    .eq('is_published', true)
    .eq('is_broken', false)
    .is('deleted_at', null)
    .limit(5000);
  if (qErr) return actionFail(`Could not load questions: ${qErr.message}`);

  const candidates: DiagnosticCandidate[] = (rows ?? [])
    .filter((r) => r.domain_code)
    .map((r) => ({ id: r.id, domainCode: r.domain_code as string, difficulty: r.difficulty }));
  const questionIds = selectDiagnosticQuestions(candidates);
  if (questionIds.length === 0) {
    return actionFail('No questions available for a diagnostic right now.');
  }

  const { data: session, error: insErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'practice',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: { diagnostic: true, actual_size: questionIds.length },
    })
    .select('id')
    .single();
  if (insErr || !session) {
    return actionFail(`Could not start the diagnostic: ${insErr?.message ?? 'unknown'}`);
  }
  redirect(`/practice/s/${session.id}/0`);
}

// ── Step 3: generate + activate the first plan ────────────────────

export async function generateFirstPlanAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }
  const { user, supabase } = ctx;

  const weeklyHours = Number(fd.get('weeklyHours'));
  if (!Number.isFinite(weeklyHours) || weeklyHours < 1 || weeklyHours > 40) {
    return actionFail('Weekly hours must be between 1 and 40.');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('target_sat_score, sat_test_date')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.target_sat_score || !profile?.sat_test_date) {
    return actionFail('Set your target score and test date first.');
  }
  // sat_test_date can come back as a full timestamp — the generator
  // validates a bare yyyy-mm-dd.
  const testDate = String(profile.sat_test_date).slice(0, 10);

  // Fold the just-finished diagnostic into the mastery snapshot so the
  // plan reflects it (§6.4). Best-effort: a failure here degrades the
  // plan's inputs, it must not block plan creation.
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
    weeklyHours,
  });
  if (res.ok) revalidatePath('/welcome');
  return res;
}

export async function activateFirstPlanAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireStudent();
  } catch (err) {
    return asFail(err);
  }

  const planId = String(fd.get('planId') ?? '');
  if (!UUID_RE.test(planId)) return actionFail('Invalid plan.');
  const res = await activatePlan(planId);
  if (!res.ok) return res;
  redirect('/today');
}
