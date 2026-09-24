// Server Actions for the Foundations card on the tutor's student page
// (docs/foundations-and-question-patterns.md §3.2 tutor roster, §4 step 5).
//
// A tutor who taught a foundation live records it as covered so the
// plan skips it. Both actions write through SECURITY DEFINER RPCs
// (migration 20260924180000) that gate on is_teacher() + can_view(student)
// inside the database, so the RLS-scoped client is the right one — no
// service-role bypass. requireRole turns a role miss into a clean error
// and assertWriter keeps demo accounts out before the round trip.

'use server';

import { revalidatePath } from 'next/cache';
import { assertWriter, requireRole } from '@/lib/api/auth';
import type { AuthContext } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult, Fail } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LessonCoveredInput {
  studentId: string;
  lessonId: string;
}

type Authorized = { ok: true; ctx: AuthContext } | { ok: false; result: Fail };

async function authorize(input: LessonCoveredInput | null | undefined): Promise<Authorized> {
  const studentId = input?.studentId;
  const lessonId = input?.lessonId;
  if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) {
    return { ok: false, result: actionFail('studentId required') };
  }
  if (typeof lessonId !== 'string' || !UUID_RE.test(lessonId)) {
    return { ok: false, result: actionFail('lessonId required') };
  }
  try {
    const ctx = await requireRole(['teacher', 'manager', 'admin']);
    assertWriter(ctx);
    return { ok: true, ctx };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, result: e.toActionResult() };
    return { ok: false, result: actionFail('Unexpected error') };
  }
}

function str(obj: unknown, key: string): string | null {
  const v = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : null;
  return typeof v === 'string' ? v : null;
}

function revalidate(studentId: string) {
  revalidatePath(`/tutor/students/${studentId}`);
  revalidatePath('/tutor/roster');
}

/** Record a lesson as covered in a live session: a completed
 *  lesson_progress row stamped covered_by / covered_at (the first mark
 *  wins; a student's own earlier completion is kept). */
export async function markLessonCovered(
  input: LessonCoveredInput,
): Promise<ActionResult<{ data: { completedAt: string | null; coveredAt: string | null; coveredByName: string | null } }>> {
  const auth = await authorize(input);
  if (!auth.ok) return auth.result;

  const { data, error } = await auth.ctx.supabase.rpc('mark_lesson_covered', {
    p_student: input.studentId,
    p_lesson: input.lessonId,
  });
  if (error) return actionFail(error.message);

  revalidate(input.studentId);
  return actionOk({
    completedAt: str(data, 'completed_at'),
    coveredAt: str(data, 'covered_at'),
    coveredByName: str(data, 'covered_by_name'),
  });
}

/** Withdraw a mark. The row the mark created is deleted; a row the
 *  student had already started keeps what they did, minus the mark. */
export async function unmarkLessonCovered(
  input: LessonCoveredInput,
): Promise<ActionResult<{ data: { deleted: boolean; completedAt: string | null } }>> {
  const auth = await authorize(input);
  if (!auth.ok) return auth.result;

  const { data, error } = await auth.ctx.supabase.rpc('unmark_lesson_covered', {
    p_student: input.studentId,
    p_lesson: input.lessonId,
  });
  if (error) return actionFail(error.message);

  revalidate(input.studentId);
  const deleted =
    data !== null && typeof data === 'object' && (data as Record<string, unknown>).deleted === true;
  return actionOk({ deleted, completedAt: str(data, 'completed_at') });
}
