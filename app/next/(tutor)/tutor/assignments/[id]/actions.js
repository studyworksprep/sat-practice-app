// Server Action for the assignment detail page.
//
// addAssignmentMembers — inserts new rows into
// assignment_students_v2 for each selected user_id under a given
// assignment. Idempotent via the (assignment_id, student_id)
// unique key — picking someone who's already enrolled is a
// no-op rather than an error.
//
// Role gating: any teacher / manager / admin can add. RLS on
// assignment_students_v2 ultimately enforces that the caller has
// permission for both the assignment and the user being added —
// if a teacher tries to add a student outside their roster, the
// insert fails. The action surfaces the supabase error message
// in that case.
//
// `student_id` is just a user_id at the schema level, so this
// action handles both the Students and Trainees cases without
// branching on role.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';

const MAX_ADD_AT_ONCE = 100;

export async function addAssignmentMembers(_prev, formData) {
  const assignmentId = formData.get('assignment_id');
  if (typeof assignmentId !== 'string' || !assignmentId) {
    return actionFail('assignment_id required');
  }

  const userIds = formData.getAll('user_id')
    .map((v) => String(v))
    .filter(Boolean);
  if (userIds.length === 0) {
    return actionFail('Pick at least one person to add.');
  }
  if (userIds.length > MAX_ADD_AT_ONCE) {
    return actionFail(`Add at most ${MAX_ADD_AT_ONCE} people at a time.`);
  }

  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  if (!['teacher', 'manager', 'admin'].includes(ctx.profile.role)) {
    return actionFail('Forbidden');
  }

  // Pre-flight: confirm the assignment exists and the caller can
  // see it. RLS on assignments_v2 returns null otherwise, which
  // we treat as a soft 403 with a clearer message than what the
  // junction insert would produce.
  const { data: assignment } = await ctx.supabase
    .from('assignments_v2')
    .select('id')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment) return actionFail('Assignment not found.');

  const rows = userIds.map((uid) => ({
    assignment_id: assignmentId,
    student_id: uid,
  }));

  // Upsert with ignoreDuplicates so re-adding someone who's
  // already enrolled is silently OK rather than an error.
  const { error } = await ctx.supabase
    .from('assignment_students_v2')
    .upsert(rows, {
      onConflict: 'assignment_id,student_id',
      ignoreDuplicates: true,
    });

  if (error) {
    return actionFail(`Could not add: ${error.message}`);
  }

  revalidatePath(`/tutor/assignments/${assignmentId}`);
  return actionOk({ added: userIds.length });
}
