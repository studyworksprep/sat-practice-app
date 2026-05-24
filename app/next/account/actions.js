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
//      teacher's profiles.teacher_invite_code). The lookup,
//      assignment insert, and one-way subscription_exempt flip
//      live in the link_self_to_teacher_by_code SECURITY DEFINER
//      RPC (migration 20260524000000) so the privilege boundary
//      is in SQL, not in Node. Adding a Studyworks tutor's code
//      keeps the student on access even if they cancel a paid
//      subscription later; adding a non-Studyworks teacher just
//      links them for assignments.
//
// All actions use the { ok, data | error } envelope from
// lib/api/response.js and are consumed via useActionState in the
// client island.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
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
 * Delegates the entire transaction to the
 * link_self_to_teacher_by_code(p_code) SECURITY DEFINER RPC
 * (migration 20260524000000). The function:
 *
 *   1. Reads auth.uid() internally — the student_id can't be
 *      spoofed by the caller.
 *   2. Resolves the code, validates the caller's role, inserts
 *      the assignment, and one-way flips subscription_exempt
 *      when the teacher is a Studyworks tutor, all in one
 *      transaction.
 *   3. Returns a jsonb { ok, error? | teacher_id, ... } envelope
 *      so we never have to parse Postgres exception messages
 *      for the user-visible "bad code" cases.
 *
 * The Node side stays on the user-scoped client — no service-
 * role bypass lives in this file.
 */
export async function addTeacherCode(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }

  const code = trimOrNull(formData.get('code'));
  if (!code) return actionFail('Enter a teacher code');

  const { data, error } = await ctx.supabase.rpc(
    'link_self_to_teacher_by_code',
    { p_code: code },
  );

  if (error) return actionFail(`Failed to link: ${error.message}`);
  if (!data || data.ok !== true) {
    return actionFail(data?.error ?? 'Failed to link');
  }

  revalidatePath('/account');
  return actionOk({
    teacher: {
      id: data.teacher_id,
      first_name: data.teacher_first_name,
      last_name: data.teacher_last_name,
      exempt: data.teacher_exempt === true,
    },
    grantedExemption: data.granted_exemption === true,
  });
}
