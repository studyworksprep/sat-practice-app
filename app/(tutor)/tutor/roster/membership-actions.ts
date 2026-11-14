'use server';

// Tutor → Roster → "Remove from roster" (migration 20261114160750).
//
// Deletes the caller's own tutor–student link. RLS
// (tsa_delete_own_tutor) allows it only for the caller's links that
// Studyworks does not sponsor; ending a sponsorship stays an admin
// decision. The student keeps their account, subscription and history,
// and can rejoin with a new invitation.

import { revalidatePath } from 'next/cache';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

export async function removeStudentFromRoster(
  input: { studentId: string },
): Promise<ActionResult<{ data: { studentId: string } }>> {
  const studentId = input?.studentId;
  if (!studentId || typeof studentId !== 'string') return actionFail('studentId required');

  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
    assertWriter(ctx);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data: removed, error } = await ctx.supabase
    .from('teacher_student_assignments')
    .delete()
    .eq('teacher_id', ctx.user.id)
    .eq('student_id', studentId)
    .select('student_id');
  if (error) return actionFail(`Could not remove the student: ${error.message}`);

  if (!removed?.length) {
    // Nothing deleted: either no direct link, or a sponsored one RLS
    // kept. Say which, so the tutor knows who to ask.
    const { data: link } = await ctx.supabase
      .from('teacher_student_assignments')
      .select('sponsored')
      .eq('teacher_id', ctx.user.id)
      .eq('student_id', studentId)
      .maybeSingle();
    return actionFail(
      link?.sponsored
        ? 'Studyworks sponsors this student. Ask a Studyworks admin to move them off your roster.'
        : 'This student isn’t on your own roster.',
    );
  }

  revalidatePath('/tutor/roster');
  revalidatePath('/tutor/dashboard');
  return actionOk({ studentId });
}
