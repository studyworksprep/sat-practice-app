// Server Actions for the admin user-detail page. See
// docs/architecture-plan.md §3.3, §3.9.

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole, requireServiceRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';

const VALID_ROLES = ['practice', 'student', 'teacher', 'manager', 'admin'];

function getUserId(formData) {
  const userId = formData.get('user_id');
  if (typeof userId !== 'string' || !userId) {
    throw new ApiError('user_id required', 400);
  }
  return userId;
}

/**
 * Update editable profile fields. Called from UserEditForm.
 * Only an admin caller can hit this (requireRole gate).
 */
export async function updateProfileFields(_prev, formData) {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  let userId;
  try {
    userId = getUserId(formData);
  } catch (err) {
    return err.toActionResult();
  }

  const updates = {
    first_name: stringOrNull(formData.get('first_name')),
    last_name: stringOrNull(formData.get('last_name')),
    email: stringOrNull(formData.get('email')),
    high_school: stringOrNull(formData.get('high_school')),
    tutor_name: stringOrNull(formData.get('tutor_name')),
    graduation_year: numberOrNull(formData.get('graduation_year')),
    target_sat_score: numberOrNull(formData.get('target_sat_score')),
  };

  if (
    updates.target_sat_score != null &&
    (updates.target_sat_score < 400 || updates.target_sat_score > 1600)
  ) {
    return actionFail('Target SAT score must be between 400 and 1600');
  }
  if (
    updates.graduation_year != null &&
    (updates.graduation_year < 1900 || updates.graduation_year > 2100)
  ) {
    return actionFail('Graduation year out of range');
  }

  const { error } = await ctx.supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) return actionFail(`Failed to save: ${error.message}`);

  revalidatePath(`/admin/users/${userId}`);
  return actionOk({ saved: true });
}

/**
 * Change a user's role. Promoting to admin requires an explicit
 * `confirm_admin` flag in the form data; the client surfaces a
 * confirm UI before sending it. Demotion or non-admin changes go
 * through without the flag.
 */
export async function changeRole(_prev, formData) {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  let userId;
  try {
    userId = getUserId(formData);
  } catch (err) {
    return err.toActionResult();
  }

  const role = formData.get('role');
  if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
    return actionFail('Invalid role');
  }

  if (role === 'admin') {
    const confirmAdmin = formData.get('confirm_admin');
    if (confirmAdmin !== 'yes') {
      return actionFail('Admin promotion requires confirmation');
    }
  }

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) return actionFail(`Failed to change role: ${error.message}`);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');
  return actionOk({ role });
}

/**
 * Toggle active status. Default action for "remove a normal user."
 */
export async function toggleActive(_prev, formData) {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  let userId;
  try {
    userId = getUserId(formData);
  } catch (err) {
    return err.toActionResult();
  }

  const next = formData.get('next_state');
  const isActive = next === 'active';

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId);

  if (error) return actionFail(`Failed: ${error.message}`);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath('/admin/users');
  return actionOk({ is_active: isActive });
}

/**
 * Permanently delete the user (profile + auth.users row). Used to
 * clean up test/bad accounts. For routine "remove this student,"
 * use toggleActive instead.
 *
 * Deleting requires service-role (auth.admin.deleteUser). The caller
 * is still gated as admin via requireServiceRole's allowedRoles.
 */
export async function deleteUser(_prev, formData) {
  let ctx;
  try {
    ctx = await requireServiceRole('admin: permanent user deletion', {
      allowedRoles: ['admin'],
    });
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  let userId;
  try {
    userId = getUserId(formData);
  } catch (err) {
    return err.toActionResult();
  }

  if (userId === ctx.user.id) {
    return actionFail('You cannot delete your own account.');
  }

  // Confirm token. Client must include `confirm=DELETE` to proceed.
  if (formData.get('confirm') !== 'DELETE') {
    return actionFail('Type DELETE to confirm permanent removal');
  }

  // Delete profile first (no FK cascade reliance).
  const { error: profileErr } = await ctx.service
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileErr) return actionFail(`Failed: ${profileErr.message}`);

  const { error: authErr } = await ctx.service.auth.admin.deleteUser(userId);

  if (authErr) return actionFail(`Auth delete failed: ${authErr.message}`);

  revalidatePath('/admin/users');
  redirect('/admin/users');
}

/**
 * Add a teacher-student assignment. Called from the relationship
 * editor on the user-detail page. Either id may be the page subject;
 * the form passes both explicitly.
 */
export async function assignTeacherStudent(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const teacherId = formData.get('teacher_id');
  const studentId = formData.get('student_id');
  if (typeof teacherId !== 'string' || typeof studentId !== 'string') {
    return actionFail('Both teacher_id and student_id required');
  }

  const { error } = await ctx.supabase
    .from('teacher_student_assignments')
    .insert({ teacher_id: teacherId, student_id: studentId });

  if (error) return actionFail(`Failed to assign: ${error.message}`);

  const subjectId = formData.get('subject_id');
  if (typeof subjectId === 'string') revalidatePath(`/admin/users/${subjectId}`);
  return actionOk({});
}

export async function unassignTeacherStudent(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const teacherId = formData.get('teacher_id');
  const studentId = formData.get('student_id');
  if (typeof teacherId !== 'string' || typeof studentId !== 'string') {
    return actionFail('Both teacher_id and student_id required');
  }

  const { error } = await ctx.supabase
    .from('teacher_student_assignments')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId);

  if (error) return actionFail(`Failed to unassign: ${error.message}`);

  const subjectId = formData.get('subject_id');
  if (typeof subjectId === 'string') revalidatePath(`/admin/users/${subjectId}`);
  return actionOk({});
}

export async function assignManagerTeacher(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const managerId = formData.get('manager_id');
  const teacherId = formData.get('teacher_id');
  if (typeof managerId !== 'string' || typeof teacherId !== 'string') {
    return actionFail('Both manager_id and teacher_id required');
  }

  const { error } = await ctx.supabase
    .from('manager_teacher_assignments')
    .insert({ manager_id: managerId, teacher_id: teacherId });

  if (error) return actionFail(`Failed to assign: ${error.message}`);

  const subjectId = formData.get('subject_id');
  if (typeof subjectId === 'string') revalidatePath(`/admin/users/${subjectId}`);
  return actionOk({});
}

export async function unassignManagerTeacher(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const managerId = formData.get('manager_id');
  const teacherId = formData.get('teacher_id');
  if (typeof managerId !== 'string' || typeof teacherId !== 'string') {
    return actionFail('Both manager_id and teacher_id required');
  }

  const { error } = await ctx.supabase
    .from('manager_teacher_assignments')
    .delete()
    .eq('manager_id', managerId)
    .eq('teacher_id', teacherId);

  if (error) return actionFail(`Failed to unassign: ${error.message}`);

  const subjectId = formData.get('subject_id');
  if (typeof subjectId === 'string') revalidatePath(`/admin/users/${subjectId}`);
  return actionOk({});
}

function stringOrNull(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function numberOrNull(v) {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
