// Server Action for the training assignment detail page.
//
// Mirror of the student startAssignmentPractice (in
// app/next/(student)/assignments/[id]/actions.js) — same RLS-
// safety re-checks, same practice_sessions row creation — with
// these training-tree differences:
//
//   - role gate accepts teacher / manager / admin
//   - mode='training' on the inserted session, so the teacher's
//     own training data stays separate from any student-mode
//     telemetry they might also have
//   - redirect points at /tutor/training/practice/s/<sid>/0 so
//     the teacher stays inside the Train context
//
// filter_criteria.assignment_id is set the same way the student
// flow does it — that's how the review page detects assignment
// context and shows the report (timing band + daily map).

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';

export async function startTrainingAssignment(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, profile, supabase } = ctx;

  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    return actionFail('Training is for teachers, managers, and admins.');
  }

  const rl = await rateLimit(`training-start:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many session starts. Please wait a moment and try again.');
  }

  const assignmentId = formData?.get?.('assignment_id');
  if (!assignmentId || typeof assignmentId !== 'string') {
    return actionFail('Invalid assignment id');
  }

  const { data: assignment } = await supabase
    .from('assignments_v2')
    .select('id, assignment_type, question_ids, deleted_at')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment || assignment.deleted_at) {
    return actionFail('Assignment not found');
  }
  if (assignment.assignment_type !== 'questions') {
    return actionFail('This assignment type is not a question set.');
  }

  // Confirm the caller is on this assignment as the trainee. RLS
  // already filters via can_view, but the explicit check gives a
  // clean error and ensures we don't write a session for a teacher
  // who happens to have visibility on the parent without being the
  // assignee.
  const { data: enrolled } = await supabase
    .from('assignment_students_v2')
    .select('student_id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle();
  if (!enrolled) {
    return actionFail('You are not assigned to this training assignment.');
  }

  const questionIds = Array.isArray(assignment.question_ids)
    ? assignment.question_ids.filter(Boolean)
    : [];
  if (questionIds.length === 0) {
    return actionFail('This assignment has no questions.');
  }

  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'training',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: { assignment_id: assignmentId },
    })
    .select('id')
    .single();

  if (insertErr || !session) {
    return actionFail(`Failed to create session: ${insertErr?.message ?? 'unknown'}`);
  }

  redirect(`/tutor/training/practice/s/${session.id}/0`);
}
