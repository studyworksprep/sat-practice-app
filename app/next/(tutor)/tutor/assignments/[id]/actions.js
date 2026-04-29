// Server Action for the assignment detail page.
//
// addAssignmentMembers — inserts new rows into
// assignment_students_v2 for each selected user_id under a given
// assignment. Idempotent via the (assignment_id, student_id)
// unique key — picking someone who's already enrolled is a
// no-op rather than an error.
//
// submitAssignmentOnBehalf — manual override for tutors and
// managers. Marks a student's most recent practice session for
// the assignment as completed and stamps assignment_students_v2.
// completed_at = now, even if the student never hit Submit Set.
// Returns the session id so the caller can redirect into the
// report.
//
// Role gating: any teacher / manager / admin can add or submit-
// on-behalf. RLS on assignment_students_v2 / practice_sessions
// ultimately enforces that the caller has permission for both
// the assignment and the user being acted on.
//
// `student_id` is just a user_id at the schema level, so these
// actions handle both the Students and Trainees cases without
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

export async function submitAssignmentOnBehalf(_prev, formData) {
  const assignmentId = formData.get('assignment_id');
  const studentId = formData.get('student_id');
  if (typeof assignmentId !== 'string' || !assignmentId) {
    return actionFail('assignment_id required');
  }
  if (typeof studentId !== 'string' || !studentId) {
    return actionFail('student_id required');
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

  // Pre-flight: caller must be able to see both the assignment
  // and the junction row for this student. The junction lookup
  // doubles as authorization — RLS will filter it out if the
  // caller can't see the pair.
  const [{ data: assignment }, { data: junction }] = await Promise.all([
    ctx.supabase
      .from('assignments_v2')
      .select('id, assignment_type')
      .eq('id', assignmentId)
      .maybeSingle(),
    ctx.supabase
      .from('assignment_students_v2')
      .select('student_id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle(),
  ]);
  if (!assignment) return actionFail('Assignment not found.');
  if (!junction) return actionFail('Student is not on this assignment.');

  // Find the latest in-progress / completed practice session for
  // this student on this assignment so the report has somewhere
  // to live. Falling back to in-progress means a tutor can close
  // out a session that's mid-flight; an already-completed session
  // is also fine — we just refresh the timestamp.
  const { data: latestSession } = await ctx.supabase
    .from('practice_sessions')
    .select('id, status')
    .eq('user_id', studentId)
    .eq('filter_criteria->>assignment_id', assignmentId)
    .neq('status', 'abandoned')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Flip the session to completed (best-effort — if no session
  // exists yet, we still mark the assignment as completed so the
  // tutor can clear it from the open queue. Reports just won't be
  // available until the student starts a session.)
  if (latestSession && latestSession.status !== 'completed') {
    const { error: updateErr } = await ctx.supabase
      .from('practice_sessions')
      .update({
        status: 'completed',
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', latestSession.id)
      .eq('status', 'in_progress');
    if (updateErr) {
      return actionFail(`Could not close session: ${updateErr.message}`);
    }
  }

  // Mark the assignment completed regardless of session state.
  // Mirrors submitPracticeSession's "Submit Set wins" semantics
  // so re-submission also bumps the completion timestamp.
  const { error: junctionErr } = await ctx.supabase
    .from('assignment_students_v2')
    .update({ completed_at: new Date().toISOString() })
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId);
  if (junctionErr) {
    return actionFail(`Could not mark complete: ${junctionErr.message}`);
  }

  revalidatePath(`/tutor/assignments/${assignmentId}`);
  revalidatePath(`/tutor/students/${studentId}`);
  revalidatePath(`/tutor/teachers/${studentId}`);
  return actionOk({ sessionId: latestSession?.id ?? null });
}
