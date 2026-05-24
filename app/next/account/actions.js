// Server Actions for the Account page. Three concerns live here:
//
//   1. Profile edits — name, high school, graduation year, target
//      SAT score, personal SAT test date. Writes to profiles via
//      the user-scoped (RLS) client. Each user can only update
//      their own row by RLS policy, so no extra gate is needed.
//
//   2. Email change — routed through supabase.auth.updateUser,
//      which sends a confirmation email. profiles.email is the
//      mirror; it gets updated on confirmation by the existing
//      auth → profile sync. We do not touch it here.
//
//   3. Teacher connection — student enters a code (the
//      teacher's profiles.teacher_invite_code). We look up the
//      teacher, insert into teacher_student_assignments, and —
//      crucially — if the teacher is a Studyworks tutor
//      (subscription_exempt = true on their profile), we flip
//      the student's own subscription_exempt to true. After that
//      flip, the student keeps access even if they cancel an
//      existing subscription. Adding a non-exempt (external)
//      teacher just creates the assignment; access still depends
//      on their subscription.
//
// All actions use the { ok, data | error } envelope from
// lib/api/response.js and are consumed via useActionState in the
// client island.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser, requireServiceRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';

function trimOrNull(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return s.length > 0 ? s : null;
}

function toIntOrNull(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Update the caller's profile fields. Fields are merged — only
 * keys present in formData are touched, so the form can submit
 * partial updates without clobbering other columns.
 */
export async function updateProfile(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }

  const updates = {};

  if (formData.has('first_name')) {
    updates.first_name = trimOrNull(formData.get('first_name'));
  }
  if (formData.has('last_name')) {
    updates.last_name = trimOrNull(formData.get('last_name'));
  }
  if (formData.has('high_school')) {
    updates.high_school = trimOrNull(formData.get('high_school'));
  }
  if (formData.has('graduation_year')) {
    const year = toIntOrNull(formData.get('graduation_year'));
    if (year != null && (year < 2000 || year > 2100)) {
      return actionFail('Graduation year is out of range');
    }
    updates.graduation_year = year;
  }
  if (formData.has('target_sat_score')) {
    const raw = formData.get('target_sat_score');
    if (raw === '' || raw == null) {
      updates.target_sat_score = null;
    } else {
      const target = Number(raw);
      if (!Number.isFinite(target)) return actionFail('Target must be a number');
      if (target < 400 || target > 1600) return actionFail('Target must be between 400 and 1600');
      if (target % 10 !== 0) return actionFail('SAT scores are in 10-point increments');
      updates.target_sat_score = target;
    }
  }
  if (formData.has('sat_test_date')) {
    const raw = formData.get('sat_test_date');
    updates.sat_test_date = trimOrNull(raw);
  }

  if (Object.keys(updates).length === 0) {
    return actionFail('Nothing to update');
  }

  const { error } = await ctx.supabase
    .from('profiles')
    .update(updates)
    .eq('id', ctx.user.id);

  if (error) return actionFail(`Failed to save: ${error.message}`);

  revalidatePath('/account');
  revalidatePath('/dashboard');
  return actionOk(updates);
}

/**
 * Begin an email change. Supabase sends a confirmation link to
 * the NEW address; the change does not take effect until the
 * user clicks it. profiles.email is not updated here — the
 * existing auth → profile sync handles that on confirmation.
 */
export async function updateEmail(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }

  const next = trimOrNull(formData.get('email'));
  if (!next) return actionFail('Email is required');
  // Lightweight format check — the auth API will do the real validation.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    return actionFail('That does not look like a valid email address');
  }
  if (next.toLowerCase() === (ctx.user.email ?? '').toLowerCase()) {
    return actionFail('That is already your email address');
  }

  const { error } = await ctx.supabase.auth.updateUser({ email: next });
  if (error) return actionFail(error.message);

  return actionOk({ pending: next });
}

/**
 * Link the caller to a teacher via the teacher's invite code.
 *
 * Flow:
 *   1. Look up the teacher by profiles.teacher_invite_code. The
 *      lookup runs under service-role because RLS otherwise
 *      hides teacher rows from students — we need to resolve
 *      the code without leaking which teachers exist (the only
 *      thing we tell the student is "valid / invalid").
 *   2. Upsert into teacher_student_assignments. Idempotent — if
 *      the student is already linked, that's fine.
 *   3. If the teacher is a Studyworks tutor (subscription_exempt
 *      = true on their profile), flip the student's
 *      subscription_exempt to true. This is one-way: we never
 *      flip it back from this surface, so canceling a paid
 *      subscription later still leaves the student with access.
 *
 * Only students can add a teacher code through this surface.
 * Teachers / managers / admins manage their own rosters through
 * the tutor / admin trees.
 */
export async function addTeacherCode(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }

  if (!['student', 'practice'].includes(ctx.profile.role ?? '')) {
    return actionFail('Only students can add a teacher code here');
  }

  const code = trimOrNull(formData.get('code'));
  if (!code) return actionFail('Enter a teacher code');
  const normalized = code.toUpperCase();

  // Service role needed because RLS would hide the teacher's
  // profile row from a student doing the lookup. The reason is
  // narrow: resolve one code to one teacher; nothing else is
  // exposed back to the caller.
  let svcCtx;
  try {
    svcCtx = await requireServiceRole('student resolves teacher_invite_code → teacher_id');
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data: teacher, error: lookupErr } = await svcCtx.service
    .from('profiles')
    .select('id, first_name, last_name, subscription_exempt, role')
    .eq('teacher_invite_code', normalized)
    .maybeSingle();

  if (lookupErr) return actionFail(`Failed to resolve code: ${lookupErr.message}`);
  if (!teacher) {
    return actionFail('That code did not match a teacher. Double-check with your teacher and try again.');
  }
  if (teacher.id === ctx.user.id) {
    return actionFail('That is your own teacher code');
  }
  if (!['teacher', 'manager', 'admin'].includes(teacher.role)) {
    return actionFail('That code does not belong to a teacher');
  }

  // Idempotent link. onConflict targets the composite key so
  // re-submitting the same code is a no-op (and not an error).
  const { error: assignErr } = await svcCtx.service
    .from('teacher_student_assignments')
    .upsert(
      { teacher_id: teacher.id, student_id: ctx.user.id },
      { onConflict: 'teacher_id,student_id' },
    );
  if (assignErr) return actionFail(`Failed to link: ${assignErr.message}`);

  // Studyworks tutors are flagged via profiles.subscription_exempt.
  // Linking to one of them flips the student's own exempt flag so
  // they keep access even if a paid subscription is later canceled.
  let grantedExemption = false;
  if (teacher.subscription_exempt === true && ctx.profile.subscription_exempt !== true) {
    const { error: flipErr } = await svcCtx.service
      .from('profiles')
      .update({ subscription_exempt: true })
      .eq('id', ctx.user.id);
    if (flipErr) return actionFail(`Linked, but failed to grant access: ${flipErr.message}`);
    grantedExemption = true;
  }

  revalidatePath('/account');
  return actionOk({
    teacher: {
      id: teacher.id,
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      exempt: teacher.subscription_exempt === true,
    },
    grantedExemption,
  });
}
