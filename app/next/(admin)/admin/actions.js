// Admin-tree shared Server Actions. Currently houses the bulk
// migration cutover used by the /admin landing page.
//
// The per-student "Migrate to new tree" button on the tutor student-
// detail page (MigrateToNextButton) does the same three steps for
// one user. This bulk version chips through the remaining legacy
// students 50 at a time so admins don't have to click into each
// student individually as the cutover wraps up.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, requireServiceRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { recomputeAttemptScores } from '@/lib/practice-test/recompute-scores';

// 50 per click is the cap that keeps the worst-case run (a student
// with many practice-test attempts × per-attempt score recompute)
// inside Vercel's Server Action timeout. Bumping this requires
// either moving to a background job or chunking the recompute.
const BATCH_SIZE = 50;

/**
 * Migrate up to BATCH_SIZE students currently on the legacy tree
 * (profiles.role = 'student' AND profiles.ui_version IS NULL OR
 * 'legacy') to ui_version = 'next'. Mirror of migrateUserToNext in
 * the tutor student-detail actions, applied in a loop.
 *
 * Per user, in order:
 *   1. import_student_practice_history (idempotent — RPC self-gates
 *      on profiles.practice_test_v2_imported_at).
 *   2. import_student_error_notes (idempotent — ON CONFLICT keeps
 *      v2-side edits).
 *   3. recomputeAttemptScores for every practice_test_attempts_v2
 *      row belonging to the user (idempotent — skips rows already
 *      scored).
 *   4. Set profiles.ui_version = 'next'. The sync trigger mirrors
 *      this into auth.users.raw_app_meta_data so the JWT picks it
 *      up on next refresh and the proxy routes the user to /next/...
 *
 * Errors are caught per-user so one failure doesn't abort the
 * batch. The result includes a per-user breakdown.
 *
 * Authorization: admin only (managers can do per-student via the
 * tutor page, but bulk cutover is admin-only).
 */
export async function bulkMigrateLegacyStudents(_prev, _formData) {
  let userCtx;
  try {
    userCtx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  if (userCtx.profile.role !== 'admin') {
    return actionFail('Only admins can run the bulk migration.');
  }

  let svcCtx;
  try {
    svcCtx = await requireServiceRole(
      'admin: bulk-migrate legacy students to ui_version=next',
      { allowedRoles: ['admin'] },
    );
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  // Pull the next batch of legacy students. ui_version may be NULL
  // for never-set rows or the literal 'legacy'; .neq('ui_version',
  // 'next') alone would skip NULLs, so use an .or() clause. Order
  // by created_at asc so repeated clicks chip through deterministically.
  const { data: candidates, error: queryErr } = await svcCtx.service
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('role', 'student')
    .or('ui_version.is.null,ui_version.eq.legacy')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (queryErr) {
    return actionFail(`Could not load legacy students: ${queryErr.message}`);
  }

  if (!candidates || candidates.length === 0) {
    return actionOk({
      processed: 0,
      succeeded: 0,
      failed: 0,
      remaining: 0,
      results: [],
    });
  }

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (const student of candidates) {
    try {
      // 1. v1 → v2 import. Idempotent.
      const { error: importErr } = await svcCtx.service.rpc(
        'import_student_practice_history',
        { p_student_id: student.id },
      );
      if (importErr) throw new Error(`import_student_practice_history: ${importErr.message}`);

      // 2. Error-note backfill. Idempotent.
      const { error: errNotesErr } = await svcCtx.service.rpc(
        'import_student_error_notes',
        { p_user_id: student.id },
      );
      if (errNotesErr) throw new Error(`import_student_error_notes: ${errNotesErr.message}`);

      // 3. Re-score the imported attempts. Idempotent — recomputeAttemptScores
      //    no-ops on already-scored rows.
      const { data: imported, error: attemptsErr } = await svcCtx.service
        .from('practice_test_attempts_v2')
        .select('id')
        .eq('user_id', student.id);
      if (attemptsErr) throw new Error(`fetch attempts: ${attemptsErr.message}`);

      let recomputed = 0;
      for (const a of imported ?? []) {
        const r = await recomputeAttemptScores(svcCtx.service, a.id);
        if (r?.ok && r.changed) recomputed += 1;
      }

      // 4. Flip the canonical flag. The sync_role_to_auth_metadata
      //    trigger mirrors this into auth.users.raw_app_meta_data.
      const { error: flipErr } = await svcCtx.service
        .from('profiles')
        .update({ ui_version: 'next' })
        .eq('id', student.id);
      if (flipErr) throw new Error(`flip ui_version: ${flipErr.message}`);

      results.push({
        ok: true,
        id: student.id,
        email: student.email,
        name: displayName(student),
        attempts: imported?.length ?? 0,
        recomputed,
      });
      succeeded += 1;
    } catch (err) {
      results.push({
        ok: false,
        id: student.id,
        email: student.email,
        name: displayName(student),
        error: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
    }
  }

  // After the batch, count what's still legacy so the UI can show
  // "X remaining" without re-running the page render.
  const { count: remaining } = await svcCtx.service
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'student')
    .or('ui_version.is.null,ui_version.eq.legacy');

  revalidatePath('/admin');

  return actionOk({
    processed: candidates.length,
    succeeded,
    failed,
    remaining: remaining ?? 0,
    results,
  });
}

function displayName(p) {
  const first = p.first_name?.trim();
  const last = p.last_name?.trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  return p.email ?? '—';
}
