// Server Actions for the tutor Roster page.
//
// updateStudentProfile — quick-edit modal mutator. Lets a tutor /
// manager / admin patch a small allowlist of profile fields on a
// student they can see. The set of fields mirrors the legacy
// /api/teacher/student/[studentId]/profile route plus is_active.
//
// Authorization. requireRole gates teacher/manager/admin; a
// can_view RPC call confirms the caller can see the target. We
// hit the service-role client for the actual write because RLS
// on profiles only exposes UPDATE for self / admin — tutors and
// managers writing fields on their student rows need the bypass,
// and the can_view gate above is what makes that bypass safe.
//
// Allowlist. The shape stays narrow on purpose. role / email /
// is_admin / etc. would be privilege expansion; everything here
// is editorial student-profile metadata that any authorized
// tutor can already see and probably already maintains in a
// spreadsheet today.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole, requireServiceRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

// sat_test_date is intentionally NOT in this allowlist. The
// canonical home for test dates is sat_test_registrations on
// the student detail page, which supports past + future entries;
// a single-value column on profiles couldn't model that.
const ALLOWED_FIELDS = [
  'first_name',
  'last_name',
  'high_school',
  'graduation_year',
  'target_sat_score',
  'start_date',
  'is_active',
] as const;

export interface UpdateStudentProfileInput {
  studentId: string;
  patch: Partial<Record<(typeof ALLOWED_FIELDS)[number], string | number | boolean | null>>;
}

export async function updateStudentProfile(
  input: UpdateStudentProfileInput,
): Promise<ActionResult<{ data: { studentId: string } | null }>> {
  const { studentId, patch } = input ?? ({} as UpdateStudentProfileInput);
  if (!studentId || typeof studentId !== 'string') {
    return actionFail('studentId required');
  }

  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
  } catch (e) {
    if (e instanceof ApiError) return e.toActionResult();
    return actionFail('Unexpected error');
  }

  // can_view covers admin + direct tutor->student + manager->tutor->student
  // + class enrollments. RLS-scoped client so auth.uid() resolves.
  const { data: canView } = await ctx.supabase.rpc('can_view', { target: studentId });
  if (!canView) return actionFail('Forbidden');

  // Project the input down to the allowlist and coerce numeric
  // inputs that arrive as strings (HTML <input type="number"> sends
  // strings via FormData even when the server side expects ints).
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (!(key in patch)) continue;
    let value = patch[key];
    if (value === '') value = null;
    if (key === 'graduation_year' || key === 'target_sat_score') {
      if (value != null) {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          return actionFail(`${key} must be a number`);
        }
        value = n;
      }
    }
    if (key === 'is_active') {
      // Coerce 'true'/'false' strings (from FormData / radios) plus
      // booleans. Anything else collapses to false rather than
      // silently writing garbage.
      if (typeof value === 'string') value = value === 'true';
      value = Boolean(value);
    }
    updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return actionFail('No fields to update');
  }

  // Service-role write. RLS on profiles only exposes UPDATE to
  // self / admin; this path needs the bypass, gated by the
  // can_view check above.
  let svc;
  try {
    ({ service: svc } = await requireServiceRole(
      `tutor profile-edit for student ${studentId}`,
      { allowedRoles: ['teacher', 'manager', 'admin'] },
    ));
  } catch (e) {
    if (e instanceof ApiError) return e.toActionResult();
    return actionFail('Unexpected error');
  }

  const { error } = await svc.from('profiles').update(updates).eq('id', studentId);
  if (error) return actionFail(error.message);

  revalidatePath('/tutor/roster');
  revalidatePath(`/tutor/students/${studentId}`);
  return actionOk({ studentId });
}
