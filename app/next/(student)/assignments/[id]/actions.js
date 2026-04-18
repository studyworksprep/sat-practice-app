// Server Actions for the assignment detail page. See
// docs/architecture-plan.md §3.7 (opaque sessions) and §3.9 (Server
// Actions over HTTP).
//
// startAssignmentPractice creates a practice_sessions row populated
// from the assignment's question_ids and redirects the student into
// the opaque /practice/s/<sid>/<pos> URL. RLS on assignments_v2 +
// assignment_students_v2 already enforces "this student must actually
// be on this assignment" — we just re-verify inline so the action
// can fail with a clean message instead of an RLS miss returning 0
// rows and looking like a generic "not found".
//
// Signature is (prevState, formData) to match useActionState's
// contract and the rest of the Phase 2 Server Actions. The form on
// the detail page carries assignment_id as a hidden input.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';

export async function startAssignmentPractice(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  // Same 20-per-minute cap as the generic /practice/start action.
  const rl = await rateLimit(`practice-start:${user.id}`, {
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

  // RLS will filter out any assignment the caller can't see, so a
  // missing row here means "not mine" — same user-visible treatment.
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

  // Confirm the caller is actually a student on this assignment.
  // Without this check, a teacher with visibility on the parent (via
  // can_view) could start a practice session for themselves using the
  // question ids — harmless but semantically wrong.
  const { data: enrolled } = await supabase
    .from('assignment_students_v2')
    .select('student_id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', user.id)
    .maybeSingle();
  if (!enrolled) {
    return actionFail('You are not assigned to this assignment.');
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
      mode: 'practice',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: { assignment_id: assignmentId },
    })
    .select('id')
    .single();

  if (insertErr || !session) {
    return actionFail(`Failed to create session: ${insertErr?.message ?? 'unknown'}`);
  }

  redirect(`/practice/s/${session.id}/0`);
}
