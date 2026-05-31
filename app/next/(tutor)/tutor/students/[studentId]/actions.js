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
 * Authorization: admin or manager. Teachers see only the per-
 * feature import button; admins + managers see the cutover
 * button. Rollback (flipping back to legacy) is also an
 * admin/manager job — set the flag back to 'legacy' or remove
 * it from app_metadata.
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

  if (!['admin', 'manager'].includes(userCtx.profile.role)) {
    return actionFail('Only admins and managers can flip a student to the new tree.');
  }

  let svcCtx;
  try {
    svcCtx = await requireServiceRole(
      `${userCtx.profile.role}: migrate student ${studentId} to ui_version=next`,
      { allowedRoles: ['admin', 'manager'] },
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

  // 3. Flip the canonical flag on profiles.ui_version. A
  //    database trigger (sync_role_to_auth_metadata, migration
  //    20240101000002) mirrors any profiles.ui_version change
  //    into auth.users.raw_app_meta_data so the JWT picks it up
  //    on next token refresh — that's how the proxy (which reads
  //    JWT app_metadata, zero DB hops) sees the flip.
  //
  //    Earlier versions of this action wrote app_metadata directly
  //    via auth.admin.updateUserById. That bypassed the trigger
  //    and left profiles.ui_version stuck at 'legacy', so the
  //    admin User Management page — which reads from profiles —
  //    kept reporting migrated students as legacy. Migration
  //    20260505_backfill_profiles_ui_version_from_auth fixed the
  //    historical drift; routing the write through profiles keeps
  //    them in sync going forward.
  const { error: flipErr } = await svcCtx.service
    .from('profiles')
    .update({ ui_version: 'next' })
    .eq('id', studentId);
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

// ──────────────────────────────────────────────────────────────
// Test registrations + official scores. Mirrors the legacy
// /api/teacher/student/[studentId]/registrations and /scores
// routes; rewritten as Server Actions to match the new tree's
// mutation pattern.
// ──────────────────────────────────────────────────────────────

const SAT_DOMAIN_FIELDS = [
  'domain_ini', 'domain_cas', 'domain_eoi', 'domain_sec',
  'domain_alg', 'domain_atm', 'domain_pam', 'domain_geo',
];

async function authorizeStudentEdit(studentId) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, result: err.toActionResult() };
    return { ok: false, result: actionFail('Unexpected error') };
  }
  if (!['teacher', 'manager', 'admin'].includes(ctx.profile.role)) {
    return { ok: false, result: actionFail('Forbidden') };
  }
  // can_view returns true for admin and any tutor / manager who
  // can see this student via the unified visibility model.
  const { data: canView } = await ctx.supabase.rpc('can_view', { target: studentId });
  if (!canView) return { ok: false, result: actionFail('Forbidden') };
  return { ok: true, ctx };
}

export async function addTestRegistration(_prev, formData) {
  const studentId = String(formData.get('student_id') ?? '');
  const testDate = String(formData.get('test_date') ?? '');
  if (!studentId) return actionFail('student_id required');
  if (!testDate) return actionFail('Test date required');

  const auth = await authorizeStudentEdit(studentId);
  if (!auth.ok) return auth.result;

  const { error, data } = await auth.ctx.supabase
    .from('sat_test_registrations')
    .insert({ student_id: studentId, test_date: testDate, created_by: auth.ctx.user.id })
    .select('id, test_date, created_at')
    .single();
  if (error) return actionFail(error.message);

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({ registration: data });
}

export async function removeTestRegistration(_prev, formData) {
  const studentId = String(formData.get('student_id') ?? '');
  const id = String(formData.get('id') ?? '');
  if (!studentId || !id) return actionFail('student_id and id required');

  const auth = await authorizeStudentEdit(studentId);
  if (!auth.ok) return auth.result;

  const { error } = await auth.ctx.supabase
    .from('sat_test_registrations')
    .delete()
    .eq('id', id)
    .eq('student_id', studentId);
  if (error) return actionFail(error.message);

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({ id });
}

export async function addOfficialScore(_prev, formData) {
  const studentId = String(formData.get('student_id') ?? '');
  if (!studentId) return actionFail('student_id required');

  const testDate = String(formData.get('test_date') ?? '');
  const rwScoreStr = String(formData.get('rw_score') ?? '');
  const mathScoreStr = String(formData.get('math_score') ?? '');
  const testTypeRaw = String(formData.get('test_type') ?? 'SAT');
  const testType = ['SAT', 'PSAT'].includes(testTypeRaw) ? testTypeRaw : 'SAT';

  if (!testDate || !rwScoreStr || !mathScoreStr) {
    return actionFail('test_date, rw_score, and math_score are required');
  }
  const rw = Number(rwScoreStr);
  const math = Number(mathScoreStr);
  if (!Number.isFinite(rw) || !Number.isFinite(math)) {
    return actionFail('Scores must be numbers');
  }
  if (rw < 200 || rw > 800 || math < 200 || math > 800) {
    return actionFail('Scores must be between 200 and 800');
  }

  const auth = await authorizeStudentEdit(studentId);
  if (!auth.ok) return auth.result;

  const parseDomain = (raw) => {
    if (raw == null || raw === '') return null;
    const n = parseInt(String(raw), 10);
    return n >= 1 && n <= 7 ? n : null;
  };
  const row = {
    student_id: studentId,
    test_date: testDate,
    rw_score: rw,
    math_score: math,
    composite_score: rw + math,
    test_type: testType,
    created_by: auth.ctx.user.id,
  };
  for (const key of SAT_DOMAIN_FIELDS) {
    row[key] = parseDomain(formData.get(key));
  }

  const { error, data } = await auth.ctx.supabase
    .from('sat_official_scores')
    .insert(row)
    .select(`id, test_date, rw_score, math_score, composite_score, created_at, test_type, ${SAT_DOMAIN_FIELDS.join(', ')}`)
    .single();
  if (error) return actionFail(error.message);

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({ score: data });
}

/**
 * Delete a student's practice test attempt (v2) — for a tutor to
 * clear out an erroneous, broken, or accidentally-uploaded test.
 *
 * Authorization: caller must be a tutor / manager / admin who can
 * view the student (can_view via authorizeStudentEdit). The attempt
 * is then re-confirmed to belong to that student before anything is
 * deleted, so a tutor can't pass an attempt id from a student they
 * don't have access to.
 *
 * In-progress attempts are not deletable — a student may be actively
 * taking it. Abandon or complete it first.
 *
 * The delete cascades by hand because the shared `attempts` rows are
 * referenced *by* the item-attempt linker (FK points at attempts), so
 * the DB cascade alone would orphan them. Order mirrors the legacy
 * /api/practice-tests/attempt/[attemptId] DELETE route, but on the v2
 * tables. Service role is required: RLS only grants DELETE on these
 * tables to admins (ptav2_admin_delete), so a tutor session can't
 * issue the deletes directly.
 *
 * @returns {Promise<import('@/lib/types').ActionResult<{ data: { id: string } }>>}
 */
export async function deleteStudentPracticeTest(_prev, formData) {
  const studentId = String(formData.get('student_id') ?? '');
  const attemptId = String(formData.get('attempt_id') ?? '');
  if (!studentId || !attemptId) return actionFail('student_id and attempt_id required');

  const auth = await authorizeStudentEdit(studentId);
  if (!auth.ok) return auth.result;

  // Re-confirm the attempt belongs to this student. The session
  // client + RLS (ptav2_select uses can_view) means a tutor only
  // sees rows they're allowed to; the user_id filter pins it to the
  // student whose page this delete was issued from.
  const { data: attempt, error: attErr } = await auth.ctx.supabase
    .from('practice_test_attempts_v2')
    .select('id, user_id, status')
    .eq('id', attemptId)
    .eq('user_id', studentId)
    .maybeSingle();
  if (attErr) return actionFail(attErr.message);
  if (!attempt) return actionFail('Test not found or not accessible');
  if (attempt.status === 'in_progress') {
    return actionFail('Cannot delete a test that is still in progress.');
  }

  let svcCtx;
  try {
    svcCtx = await requireServiceRole(
      `${auth.ctx.profile.role}: delete practice_test attempt ${attemptId} for student ${studentId}`,
      { allowedRoles: ['teacher', 'manager', 'admin'] },
    );
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const service = svcCtx.service;

  // 1. Module-attempt ids for this attempt.
  const { data: moduleAttempts, error: maErr } = await service
    .from('practice_test_module_attempts_v2')
    .select('id')
    .eq('practice_test_attempt_id', attemptId);
  if (maErr) return actionFail(maErr.message);

  const moduleAttemptIds = (moduleAttempts ?? []).map((ma) => ma.id);

  if (moduleAttemptIds.length > 0) {
    // 2. Linked per-question `attempts` ids, captured before the
    //    item-attempt linker rows are removed.
    const { data: itemAttempts } = await service
      .from('practice_test_item_attempts_v2')
      .select('attempt_id')
      .in('practice_test_module_attempt_id', moduleAttemptIds);
    const sharedAttemptIds = (itemAttempts ?? []).map((ia) => ia.attempt_id).filter(Boolean);

    // 3. Item-attempt linkers (FK to attempts lives here, so these go first).
    const { error: iaDelErr } = await service
      .from('practice_test_item_attempts_v2')
      .delete()
      .in('practice_test_module_attempt_id', moduleAttemptIds);
    if (iaDelErr) return actionFail(iaDelErr.message);

    // 4. The shared per-question attempt rows, now unreferenced.
    if (sharedAttemptIds.length > 0) {
      const { error: aDelErr } = await service
        .from('attempts')
        .delete()
        .in('id', sharedAttemptIds);
      if (aDelErr) return actionFail(aDelErr.message);
    }

    // 5. Module attempts.
    const { error: maDelErr } = await service
      .from('practice_test_module_attempts_v2')
      .delete()
      .eq('practice_test_attempt_id', attemptId);
    if (maDelErr) return actionFail(maDelErr.message);
  }

  // 6. The attempt itself.
  const { error: delErr } = await service
    .from('practice_test_attempts_v2')
    .delete()
    .eq('id', attemptId);
  if (delErr) return actionFail(delErr.message);

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({ id: attemptId });
}

export async function removeOfficialScore(_prev, formData) {
  const studentId = String(formData.get('student_id') ?? '');
  const id = String(formData.get('id') ?? '');
  if (!studentId || !id) return actionFail('student_id and id required');

  const auth = await authorizeStudentEdit(studentId);
  if (!auth.ok) return auth.result;

  const { error } = await auth.ctx.supabase
    .from('sat_official_scores')
    .delete()
    .eq('id', id)
    .eq('student_id', studentId);
  if (error) return actionFail(error.message);

  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({ id });
}
