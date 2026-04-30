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

/**
 * One-button cutover. Runs `importStudentPracticeHistory` (which
 * also re-scores), then sets `app_metadata.ui_version='next'` on
 * the user's auth row via the service-role admin client. After
 * the next page load the proxy sees the new flag, rewrites the
 * student onto `/next/...`, and they land on the new tree with
 * their full history visible.
 *
 * Idempotent. Safe to retry — the import RPC self-gates on
 * `profiles.practice_test_v2_imported_at`, the recompute helper
 * skips already-scored rows, and re-setting `ui_version='next'`
 * on a user already there is a no-op.
 *
 * Authorization: admin only. Managers and teachers use the
 * separate per-feature buttons (import, etc.); only admins flip
 * a student's tree assignment, since this is the canonical
 * "graduate to next" action and rolling it back is also an admin
 * job (set the flag back to 'legacy' or remove it).
 *
 * See docs/cutover-runbook.md for the surrounding pre-flight +
 * verification checklist.
 */
export async function migrateUserToNext(_prev, formData) {
  const studentId = formData.get('student_id');
  if (typeof studentId !== 'string' || !studentId) {
    return actionFail('student_id required');
  }

  let userCtx;
  try {
    userCtx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (userCtx.profile.role !== 'admin') {
    return actionFail('Only admins can flip a student to the new tree.');
  }

  let svcCtx;
  try {
    svcCtx = await requireServiceRole(
      `admin: migrate student ${studentId} to ui_version=next`,
      { allowedRoles: ['admin'] },
    );
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  // 1. Bulk-copy v1 → v2 (idempotent — the function skips if
  //    already done).
  const { data: importResult, error: importErr } =
    await svcCtx.service.rpc('import_student_practice_history', {
      p_student_id: studentId,
    });
  if (importErr) {
    return actionFail(`Import failed: ${importErr.message}`);
  }

  // 1b. Backfill the student's legacy Error Log notes from
  //     question_status.notes (v1-keyed) into question_error_notes
  //     (v2-keyed). Idempotent — ON CONFLICT keeps any v2-side
  //     edits the user has already made.
  let errorNotesImported = 0;
  let errorNotesSkipped = 0;
  const { data: errNotesResult, error: errNotesErr } =
    await svcCtx.service.rpc('import_student_error_notes', {
      p_user_id: studentId,
    });
  if (errNotesErr) {
    return actionFail(`Error-note backfill failed: ${errNotesErr.message}`);
  }
  const errNotesRow = Array.isArray(errNotesResult) ? errNotesResult[0] : errNotesResult;
  errorNotesImported = errNotesRow?.imported_count ?? 0;
  errorNotesSkipped = errNotesRow?.skipped_existing ?? 0;

  // 2. Re-score the imported attempts. Idempotent.
  const { data: imported } = await svcCtx.service
    .from('practice_test_attempts_v2')
    .select('id')
    .eq('user_id', studentId);
  let recomputed = 0;
  for (const a of imported ?? []) {
    const r = await recomputeAttemptScores(svcCtx.service, a.id);
    if (r?.ok && r.changed) recomputed += 1;
  }

  // 3. Flip the auth flag. The Supabase admin client is the only
  //    code path that can write app_metadata (user_metadata is
  //    user-writable; app_metadata is admin-only by design, which
  //    is what we want — students can't self-migrate).
  //
  //    updateUserById replaces app_metadata wholesale rather than
  //    merging key-by-key, so read it first and write the union.
  //    Otherwise unrelated app_metadata fields (e.g. provider
  //    info) would silently disappear.
  const { data: existingUser, error: readErr } =
    await svcCtx.service.auth.admin.getUserById(studentId);
  if (readErr || !existingUser?.user) {
    return actionFail(`Could not read user: ${readErr?.message ?? 'not found'}`);
  }
  const mergedAppMeta = {
    ...(existingUser.user.app_metadata ?? {}),
    ui_version: 'next',
  };
  const { error: flipErr } = await svcCtx.service.auth.admin.updateUserById(
    studentId,
    { app_metadata: mergedAppMeta },
  );
  if (flipErr) {
    return actionFail(`Could not set ui_version: ${flipErr.message}`);
  }

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({
    flipped: true,
    importedAttempts: imported?.length ?? 0,
    recomputed,
    errorNotesImported,
    errorNotesSkipped,
    importResult: importResult ?? null,
  });
}
