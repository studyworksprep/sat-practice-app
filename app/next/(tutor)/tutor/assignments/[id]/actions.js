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
import { expandToAttemptIds } from '@/lib/practice/weak-queue';

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
    test_type: 'sat',
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
  // caller can't see the pair. We pull question_ids + created_at
  // so we can synthesize a session if none exists yet (see
  // below), and the student's role so the new session's mode
  // matches what the live runner would have written.
  const [
    { data: assignment },
    { data: junction },
    { data: studentProfile },
  ] = await Promise.all([
    ctx.supabase
      .from('assignments_v2')
      .select('id, assignment_type, question_ids, created_at')
      .eq('id', assignmentId)
      .maybeSingle(),
    ctx.supabase
      .from('assignment_students_v2')
      .select('student_id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle(),
    ctx.supabase
      .from('profiles')
      .select('role')
      .eq('id', studentId)
      .maybeSingle(),
  ]);
  if (!assignment) return actionFail('Assignment not found.');
  if (!junction) return actionFail('Student is not on this assignment.');

  // Find the latest in-progress / completed practice session for
  // this student on this assignment. Falling back to in-progress
  // means a tutor can close out a mid-flight session; an already-
  // completed one is fine too — we just refresh the timestamp.
  const { data: latestSession } = await ctx.supabase
    .from('practice_sessions')
    .select('id, status')
    .eq('user_id', studentId)
    .eq('test_type', 'sat')
    .eq('filter_criteria->>assignment_id', assignmentId)
    .neq('status', 'abandoned')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let resolvedSessionId = latestSession?.id ?? null;

  if (latestSession) {
    if (latestSession.status !== 'completed') {
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
  } else {
    // No session ever existed for this (student, assignment). The
    // student probably worked the questions outside the v2 runner
    // (legacy practice flow, pre-cutover imports, manual override
    // before this code path existed). The assignment system and
    // the session system should be the same thing — an assignment
    // IS a session driven by the tutor — so close that gap by
    // synthesizing a real session row tied to the student's
    // earliest attempt on these questions.
    const questionIds = Array.isArray(assignment.question_ids)
      ? assignment.question_ids.filter(Boolean)
      : [];

    let createdAtIso = assignment.created_at ?? new Date().toISOString();
    if (questionIds.length > 0) {
      const { allIds } = await expandToAttemptIds(ctx.supabase, questionIds);
      if (allIds.length > 0) {
        // Earliest attempt the student has on any of the
        // assignment's questions (v1 ids included via the
        // question_id_map expansion above) becomes the
        // synthetic session's start time. Anchoring there means
        // buildSessionReview's "attempts since session.created_at"
        // filter scoops up everything that should count.
        const { data: earliest } = await ctx.supabase
          .from('attempts')
          .select('created_at')
          .eq('user_id', studentId)
          .in('question_id', allIds)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (earliest?.created_at) createdAtIso = earliest.created_at;
      }
    }

    // mode='training' for trainees (teacher / manager being
    // trained), 'practice' for actual students. Matches what the
    // live runner would have written.
    const studentRole = studentProfile?.role ?? null;
    const mode = studentRole === 'teacher' || studentRole === 'manager'
      ? 'training'
      : 'practice';

    const { data: insertedSession, error: insertErr } = await ctx.supabase
      .from('practice_sessions')
      .insert({
        user_id: studentId,
        test_type: 'sat',
        mode,
        question_ids: questionIds,
        current_position: Math.max(0, questionIds.length - 1),
        status: 'completed',
        filter_criteria: { assignment_id: assignmentId },
        created_at: createdAtIso,
        last_activity_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insertErr || !insertedSession) {
      return actionFail(
        `Could not create session: ${insertErr?.message ?? 'unknown'}`,
      );
    }
    resolvedSessionId = insertedSession.id;
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
  return actionOk({ sessionId: resolvedSessionId });
}

/**
 * Archive (or un-archive) an assignment. Stamps `archived_at` on the
 * assignments_v2 row, which the assignments-list page filters into a
 * separate "Archived" section. Reversible — passing `archive=false`
 * (or omitting it from FormData) clears the timestamp, and the row
 * comes back to the active list.
 *
 * Lets a tutor clean stale work — assignments a student abandoned —
 * out of their primary view without losing the row for audit / report
 * purposes.
 *
 * Authorization: tutor / manager / admin. RLS on assignments_v2
 * already gates which rows the caller can update (`is_v2_assignment_teacher`
 * + admin), so a forged assignment_id can't reach into someone else's
 * row.
 */
export async function archiveAssignment(_prev, formData) {
  const assignmentId = formData.get('assignment_id');
  if (typeof assignmentId !== 'string' || !assignmentId) {
    return actionFail('assignment_id required');
  }

  // FormData encodes "true"/"false" as strings; treat anything other
  // than "false" as archive = true so a checkbox-less submit
  // archives by default.
  const archive = String(formData.get('archive') ?? 'true') !== 'false';

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

  const { error } = await ctx.supabase
    .from('assignments_v2')
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq('id', assignmentId);

  if (error) {
    return actionFail(`Could not ${archive ? 'archive' : 'restore'}: ${error.message}`);
  }

  revalidatePath('/tutor/assignments');
  revalidatePath(`/tutor/assignments/${assignmentId}`);
  return actionOk({ archived: archive });
}
