// Route-local form actions for the tutor Study Plan page (§2.4).
//
// These are thin adapters: they read the intake FormData, delegate to the
// shared plan-engine Server Actions (lib/plan/plan-actions.ts, which own
// validation + RLS-gated writes), and revalidate this route so the
// server-rendered draft/active sections refresh after a write. Keeping the
// shared actions free of routing concerns (revalidatePath) lets them stay
// callable programmatically; the page-specific revalidation lives here.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/response';
import { generateStudyPlan, activatePlan } from '@/lib/plan/plan-actions';
import {
  addManualPlanTask,
  movePlanTask,
  regeneratePlanWeek,
  removePlanTask,
  swapPlanTaskSkill,
} from '@/lib/plan/plan-edit-actions';
import type { PlanTaskType } from '@/lib/plan/generate-plan';
import type { ActionResult } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Fail fast at the form boundary. The shared actions re-assert auth and do
// the RLS-gated work, but asserting here too keeps this entry point guarded
// on its own (and visible to the authorization-matrix scanner).
async function ensureUser(): Promise<ActionResult | null> {
  try {
    await requireUser();
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.toActionResult() : { ok: false, error: 'Unauthorized' };
  }
}

export async function generatePlanAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const studentId = String(fd.get('studentId') ?? '');
  if (!UUID_RE.test(studentId)) return { ok: false, error: 'Invalid student.' };

  const res = await generateStudyPlan({
    studentId,
    goalScore: Number(fd.get('goalScore')),
    testDate: String(fd.get('testDate') ?? ''),
    weeklyHours: Number(fd.get('weeklyHours')),
  });
  if (res.ok) revalidatePath(`/tutor/students/${studentId}/plan`);
  return res;
}

export async function activatePlanAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const planId = String(fd.get('planId') ?? '');
  const studentId = String(fd.get('studentId') ?? '');
  const res = await activatePlan(planId);
  if (res.ok && UUID_RE.test(studentId)) {
    revalidatePath(`/tutor/students/${studentId}/plan`);
  }
  return res;
}

// ── Plan-editor adapters (§2.4) ───────────────────────────────────
// Same shape as the two above: read FormData, delegate to the shared
// plan-edit actions (which own validation + RLS-gated writes), then
// revalidate this route so the server-rendered weeks refresh.

function revalidateFor(fd: FormData): void {
  const studentId = String(fd.get('studentId') ?? '');
  if (UUID_RE.test(studentId)) revalidatePath(`/tutor/students/${studentId}/plan`);
}

export async function moveTaskAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const res = await movePlanTask({
    taskId: String(fd.get('taskId') ?? ''),
    weekIndex: Number(fd.get('weekIndex')),
  });
  if (res.ok) revalidateFor(fd);
  return res;
}

export async function removeTaskAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const res = await removePlanTask({ taskId: String(fd.get('taskId') ?? '') });
  if (res.ok) revalidateFor(fd);
  return res;
}

export async function swapSkillAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  // The unit select posts "DOMAIN|SKILL" as one value.
  const [domainCode = '', skillCode = ''] = String(fd.get('unit') ?? '').split('|');
  const res = await swapPlanTaskSkill({
    taskId: String(fd.get('taskId') ?? ''),
    domainCode,
    skillCode,
  });
  if (res.ok) revalidateFor(fd);
  return res;
}

export async function addTaskAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const [domainCode = '', skillCode = ''] = String(fd.get('unit') ?? '').split('|');
  const res = await addManualPlanTask({
    planId: String(fd.get('planId') ?? ''),
    weekIndex: Number(fd.get('weekIndex')),
    taskType: String(fd.get('taskType') ?? '') as PlanTaskType,
    domainCode: domainCode || undefined,
    skillCode: skillCode || undefined,
    title: String(fd.get('title') ?? ''),
    why: String(fd.get('why') ?? ''),
  });
  if (res.ok) revalidateFor(fd);
  return res;
}

export async function regenerateWeekAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const denied = await ensureUser();
  if (denied) return denied;

  const res = await regeneratePlanWeek({
    planId: String(fd.get('planId') ?? ''),
    weekIndex: Number(fd.get('weekIndex')),
  });
  if (res.ok) revalidateFor(fd);
  return res;
}
