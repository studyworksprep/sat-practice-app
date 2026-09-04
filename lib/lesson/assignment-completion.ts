// Lesson assignments learn when the lesson is finished.
//
// A lesson's completion has always been recorded per student in
// lesson_progress.completed_at, and the assignment detail page reads
// it. But the assignment RECORD — assignment_students_v2.completed_at,
// which the assignments list, the student's assignment pages, the
// tutor dashboard, and team effectiveness all key on — was only ever
// stamped by the practice-session paths, which are guarded to
// 'questions' / 'lesson_pack'. A finished lesson assignment therefore
// read "Not started" forever. Two intakes close the gap:
//
//   markLessonAssignmentsComplete — from the student's Complete Lesson
//       action: stamp every open lesson assignment of that lesson for
//       that student (own-row update; RLS asv2_update_self_or_teacher).
//   lessonCompletionByStudent — from the tutor's assignment-creation
//       paths: a student who already finished the lesson is stamped at
//       insert, with the lesson's own completion time, instead of
//       being shown a lesson they have done as "Not started".
//
// Both mirror the practice stamping in lib/practice/session-actions.ts:
// plain updates guarded by `.is('completed_at', null)` so a stamp is
// never moved once set.

import type { TypedSupabaseClient } from '@/lib/supabase/server';

/**
 * Stamp completed_at on every open lesson assignment of `lessonId` for
 * `userId`. Returns the number of assignment rows stamped.
 */
export async function markLessonAssignmentsComplete(
  supabase: TypedSupabaseClient,
  userId: string,
  lessonId: string,
  completedAtIso: string,
): Promise<number> {
  // The !inner embed doubles as the filter: only junction rows whose
  // assignment is a live lesson assignment of this lesson come back.
  const { data: open, error } = await supabase
    .from('assignment_students_v2')
    .select('assignment_id, assignments_v2!inner(lesson_id, assignment_type, deleted_at)')
    .eq('student_id', userId)
    .is('completed_at', null)
    .eq('assignments_v2.lesson_id', lessonId)
    .eq('assignments_v2.assignment_type', 'lesson')
    .is('assignments_v2.deleted_at', null);
  if (error) throw new Error(error.message);

  const ids = (open ?? []).map((r) => r.assignment_id);
  if (ids.length === 0) return 0;

  const { error: updateErr } = await supabase
    .from('assignment_students_v2')
    .update({ completed_at: completedAtIso })
    .eq('student_id', userId)
    .in('assignment_id', ids)
    .is('completed_at', null);
  if (updateErr) throw new Error(updateErr.message);
  return ids.length;
}

/**
 * For a lesson about to be assigned: which of `studentIds` have already
 * finished it, and when. Read as the tutor (RLS can_view covers their
 * students). Empty map on any failure — the caller treats "unknown" as
 * "not yet finished", which is the pre-existing behavior.
 */
export async function lessonCompletionByStudent(
  supabase: TypedSupabaseClient,
  lessonId: string,
  studentIds: readonly string[],
): Promise<Map<string, string>> {
  const done = new Map<string, string>();
  if (studentIds.length === 0) return done;
  const { data } = await supabase
    .from('lesson_progress')
    .select('student_id, completed_at')
    .eq('lesson_id', lessonId)
    .in('student_id', [...studentIds])
    .not('completed_at', 'is', null);
  for (const row of data ?? []) {
    if (row.completed_at) done.set(row.student_id, row.completed_at);
  }
  return done;
}
