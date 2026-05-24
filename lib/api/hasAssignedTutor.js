// True iff the student has at least one row in
// teacher_student_assignments. Used by the student dashboard
// (hide the Pending Assignments panel when there's no tutor) and
// the student layout (drop the Assignments nav tab in the same
// case). Self-studiers without a tutor never see the assignments
// surfaces, which were always empty for them.

export async function hasAssignedTutor(supabase, userId) {
  const { count } = await supabase
    .from('teacher_student_assignments')
    .select('student_id', { count: 'exact', head: true })
    .eq('student_id', userId);
  return (count ?? 0) > 0;
}
