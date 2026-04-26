// Server Actions for the tutor student-detail page.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, requireServiceRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { recomputeAttemptScores } from '@/lib/practice-test/recompute-scores';

/**
 * Per-student practice history v1 → v2 import. The button calls this
 * for the currently-viewed student.
 *
 * Authorization: caller must be able to view the student via the
 * profiles RLS — i.e., admin or tutor-assigned. The visibility check
 * happens through a user-session profile read; if RLS hides the row,
 * the caller can't run the import.
 *
 * The actual bulk copy runs through the import_student_practice_history
 * Postgres function (SECURITY DEFINER, service-role-only). One
 * transaction; idempotent via the practice_test_v2_imported_at flag.
 */
export async function importStudentPracticeHistory(_prev, formData) {
  const studentId = formData.get('student_id');
  if (typeof studentId !== 'string' || !studentId) return actionFail('student_id required');

  let userCtx;
  try {
    userCtx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  // Only tutors / managers / admins should hit this. Students never.
  if (!['teacher', 'manager', 'admin'].includes(userCtx.profile.role)) {
    return actionFail('Forbidden');
  }

  // Visibility check via RLS on profiles. If RLS hides the row, the
  // caller can't view this student → forbidden.
  const { data: visible, error: visErr } = await userCtx.supabase
    .from('profiles')
    .select('id, practice_test_v2_imported_at')
    .eq('id', studentId)
    .maybeSingle();
  if (visErr) return actionFail(`Failed: ${visErr.message}`);
  if (!visible) return actionFail('You do not have access to this student');

  if (visible.practice_test_v2_imported_at) {
    return actionOk({
      alreadyImported: true,
      importedAt: visible.practice_test_v2_imported_at,
    });
  }

  // Service role for the bulk copy. The function bypasses RLS but
  // is locked down at the GRANT level — only service-role can call it.
  let svcCtx;
  try {
    svcCtx = await requireServiceRole(`tutor: import practice_test history for student ${studentId}`);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data, error } = await svcCtx.service.rpc('import_student_practice_history', {
    p_student_id: studentId,
  });
  if (error) return actionFail(`Import failed: ${error.message}`);

  // Re-score the just-imported attempts via the same path
  // closeTestAttempt uses for live submits. Lookup-aware: hits the
  // score_conversion table first (where Bluebook uploads have been
  // writing real CB scores keyed by test + per-module correct), so
  // this is a no-op on rows whose status was already 'completed'
  // and scores were already populated. The helper's guards leave
  // abandoned and score-only-import attempts alone.
  const { data: importedAttempts } = await svcCtx.service
    .from('practice_test_attempts_v2')
    .select('id')
    .eq('user_id', studentId);
  for (const a of importedAttempts ?? []) {
    await recomputeAttemptScores(svcCtx.service, a.id);
  }

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk(data);
}
