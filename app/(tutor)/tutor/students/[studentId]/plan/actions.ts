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
