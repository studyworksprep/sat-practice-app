// Reassign-to-another-student (§4.3): copy an assignment as a NEW
// row for a different set of students. Distinct from
// addAssignmentMembers on purpose — adding a member shares the
// original row (same due date, same cohort report), while a
// reassign gives the new student their own copy with a fresh due
// date and a separate report. Content is copied verbatim
// (question_ids snapshot included) so "the same worksheet" means
// exactly that.

'use server';

import { redirect } from 'next/navigation';
import { lessonCompletionByStudent } from '@/lib/lesson/assignment-completion';
import { requireRole } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

const MAX_STUDENTS_PER_REASSIGN = 200;

export async function reassignAssignment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
  } catch (e) {
    if (e instanceof ApiError) return e.toActionResult();
    return actionFail('Unexpected error');
  }
  const { user, supabase } = ctx;

  const assignmentId = String(formData.get('assignment_id') || '').trim();
  if (!assignmentId) return actionFail('assignmentId required');

  const studentIds = formData
    .getAll('student_id')
    .map((s) => String(s))
    .filter(Boolean);
  if (studentIds.length === 0) return actionFail('Pick at least one student.');
  if (studentIds.length > MAX_STUDENTS_PER_REASSIGN) {
    return actionFail(`At most ${MAX_STUDENTS_PER_REASSIGN} students at a time.`);
  }

  const dueDateRaw = String(formData.get('due_date') || '').trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : null;

  // RLS scopes visibility: an assignment the caller can't see reads
  // as absent. Copy the content columns verbatim; ownership and
  // audit stamps are the caller's.
  const { data: source } = await supabase
    .from('assignments_v2')
    .select(
      'id, assignment_type, title, description, question_ids, filter_criteria, practice_test_id, lesson_pack_id, lesson_id, test_type, deleted_at',
    )
    .eq('id', assignmentId)
    .maybeSingle();
  if (!source || source.deleted_at) return actionFail('Assignment not found.');

  const { data: copy, error: insertErr } = await supabase
    .from('assignments_v2')
    .insert({
      teacher_id: user.id,
      assignment_type: source.assignment_type,
      title: source.title,
      description: source.description,
      due_date: dueDate,
      question_ids: source.question_ids,
      filter_criteria: source.filter_criteria,
      practice_test_id: source.practice_test_id,
      lesson_pack_id: source.lesson_pack_id,
      lesson_id: source.lesson_id,
      test_type: source.test_type ?? 'sat',
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();
  if (insertErr || !copy) {
    return actionFail(`Could not copy the assignment: ${insertErr?.message ?? 'unknown'}`);
  }

  // Same rule as creation: a student who already finished this lesson
  // is complete on arrival (see lib/lesson/assignment-completion.ts).
  let alreadyDone = new Map<string, string>();
  if (source.assignment_type === 'lesson' && source.lesson_id) {
    try {
      alreadyDone = await lessonCompletionByStudent(supabase, source.lesson_id, studentIds);
    } catch {
      alreadyDone = new Map();
    }
  }
  const { error: junctionErr } = await supabase.from('assignment_students_v2').insert(
    studentIds.map((sid) => ({
      assignment_id: copy.id,
      student_id: sid,
      test_type: source.test_type ?? 'sat',
      completed_at: alreadyDone.get(sid) ?? null,
    })),
  );
  if (junctionErr) {
    return actionFail(
      `Copy created but students could not be added: ${junctionErr.message}`,
    );
  }

  redirect(`/tutor/assignments/${copy.id}`);
}
