// Server Action behind the "Reviewed" checkbox (./ReviewedCheckbox.tsx)
// on the tutor's student page and the homework report headers. A tutor
// ticks it once they have gone over an assignment with the student;
// unreviewed work stays on the student's Overview and at the top of
// their Assignments tab.
//
// Writes through set_assignment_reviewed() (migration 20261115152919),
// a SECURITY DEFINER RPC that gates on is_teacher() + can_view(student)
// inside the database, so the RLS-scoped client is the right one — no
// service-role bypass. Same shape as the student page's
// foundation-actions.ts. The checkbox refreshes whichever page it sits
// on; this revalidates the student page, where the row changes section.

'use server';

import { revalidatePath } from 'next/cache';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssignmentReviewedInput {
  assignmentId: string;
  studentId: string;
  reviewed: boolean;
}

function str(obj: unknown, key: string): string | null {
  const v = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : null;
  return typeof v === 'string' ? v : null;
}

/** Mark (or clear) one student's copy of an assignment as reviewed.
 *  Marking an already-reviewed assignment keeps who marked it first. */
export async function setAssignmentReviewed(
  input: AssignmentReviewedInput,
): Promise<ActionResult<{ data: { reviewedAt: string | null; reviewedByName: string | null } }>> {
  const assignmentId = input?.assignmentId;
  const studentId = input?.studentId;
  if (typeof assignmentId !== 'string' || !UUID_RE.test(assignmentId)) return actionFail('assignmentId required');
  if (typeof studentId !== 'string' || !UUID_RE.test(studentId)) return actionFail('studentId required');
  if (typeof input?.reviewed !== 'boolean') return actionFail('reviewed must be true or false');

  let supabase;
  try {
    const ctx = await requireRole(['teacher', 'manager', 'admin']);
    assertWriter(ctx);
    supabase = ctx.supabase;
  } catch (e) {
    if (e instanceof ApiError) return e.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data, error } = await supabase.rpc('set_assignment_reviewed', {
    p_assignment: assignmentId,
    p_student: studentId,
    p_reviewed: input.reviewed,
  });
  if (error) return actionFail(error.message);

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({ reviewedAt: str(data, 'reviewed_at'), reviewedByName: str(data, 'reviewed_by_name') });
}
