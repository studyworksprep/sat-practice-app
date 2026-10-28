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
import { parseActAssignmentScope } from '@/lib/practice/act-assignment-scope';
import { startActPracticeTest } from '@/app/(student)/practice/tests/actions';

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
    .select('id, assignment_type, question_ids, deleted_at, test_type')
    .eq('id', assignmentId)
    .maybeSingle();
  if (!assignment || assignment.deleted_at) {
    return actionFail('Assignment not found');
  }
  // The session runs in the assignment's bank (Phase 4B): ACT question
  // sets carry act_questions ids and the runner forks on
  // practice_sessions.test_type.
  const testType = assignment.test_type === 'act' ? 'act' : 'sat';
  // 'lesson_pack' assignments materialize their pack's question
  // ids into the same question_ids column at creation time, so
  // they take the same start-a-session path as 'questions'.
  if (assignment.assignment_type !== 'questions'
      && assignment.assignment_type !== 'lesson_pack') {
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

  // Resume an existing in-progress session for this assignment instead
  // of minting a new one. The runner scopes a question's saved answer
  // to the session's created_at (load-question.ts: `since =
  // sessionCreatedAt` for assignment sessions). A brand-new session
  // starts that window "now", so the answers the student already
  // submitted in their earlier session fall before the floor and the
  // runner renders blank tiles / "0 answered" on Continue. Pick the
  // earliest in-progress session so the window floor sits before all
  // prior attempts, and drop the student back at their saved cursor.
  // "Start" (no prior session) and "Redo" (prior session is completed,
  // not in_progress) both fall through to a fresh session below.
  const { data: resumable } = await supabase
    .from('practice_sessions')
    .select('id, current_position')
    .eq('user_id', user.id)
    .eq('test_type', testType)
    .eq('status', 'in_progress')
    .eq('filter_criteria->>assignment_id', assignmentId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (resumable) {
    redirect(`/practice/s/${resumable.id}/${resumable.current_position ?? 0}`);
  }

  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: testType,
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

/**
 * ACT practice-test assignments (Phase 4B). The assignment names an
 * ACT form; starting it is exactly the ACT tests hub's Start — one
 * attempt per form, sections timed one at a time (Phase 3). Finishing
 * any attempt of the form completes the assignment
 * (lib/practice-test/act-attempt.ts). Enrollment is re-checked here
 * so a non-member can't use the assignment to pick a form.
 */
export async function startAssignmentActTest(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const assignmentId = formData?.get?.('assignment_id');
  if (!assignmentId || typeof assignmentId !== 'string') {
    return actionFail('Invalid assignment id');
  }

  const [{ data: assignment }, { data: enrolled }] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select('id, assignment_type, test_type, act_source_test, filter_criteria, deleted_at')
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select('student_id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .maybeSingle(),
  ]);
  if (!assignment || assignment.deleted_at) return actionFail('Assignment not found');
  if (!enrolled) return actionFail('You are not assigned to this assignment.');
  if (
    assignment.assignment_type !== 'practice_test'
    || assignment.test_type !== 'act'
    || !assignment.act_source_test
  ) {
    return actionFail('This assignment is not an ACT practice test.');
  }

  const fd = new FormData();
  fd.set('source_test', assignment.act_source_test);
  const scope = parseActAssignmentScope(assignment.filter_criteria?.sections);
  if (!scope) return actionFail('This assignment has an invalid section selection.');
  if (scope !== 'all') {
    for (const section of Array.isArray(scope) ? scope : [scope]) fd.append('sections', section);
  }
  const multiplier = formData.get('time_multiplier');
  if (multiplier != null) {
    if (!['1', '1.5', '2'].includes(multiplier)) return actionFail('Choose a valid time accommodation.');
    fd.set('time_multiplier', multiplier);
  }
  return startActPracticeTest(null, fd);
}
