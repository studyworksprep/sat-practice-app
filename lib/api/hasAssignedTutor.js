// True iff the student has at least one row in
// teacher_student_assignments. Used by the student dashboard
// (hide the Pending Assignments panel when there's no tutor) and
// the student layout (drop the Assignments nav tab in the same
// case). Self-studiers without a tutor never see the assignments
// surfaces, which were always empty for them.

import { cache } from 'react';

// Layout and dashboard share the same auth-context client within a request.
export const hasAssignedTutor = cache(async (supabase, userId) => {
  const { data } = await supabase
    .from('teacher_student_assignments')
    .select('student_id')
    .eq('student_id', userId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
});
