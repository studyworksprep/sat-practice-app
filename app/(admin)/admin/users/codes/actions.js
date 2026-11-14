'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import { sendStudentInvitationEmail } from '@/lib/email/studentInvitation';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode(len = 6) {
  const arr = new Uint8Array(len);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function adminCtx() {
  return requireRole(['admin']);
}

export async function createTeacherCode(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  try {
    const ctx = await adminCtx();
    const raw = formData.get('code');
    const code = ((typeof raw === 'string' && raw.trim()) || generateCode()).toUpperCase();

    if (code.length < 4) return actionFail('Code must be at least 4 characters');

    const { error } = await ctx.supabase
      .from('teacher_codes')
      .insert({ code });

    if (error) {
      if (error.code === '23505') return actionFail('That code already exists');
      return actionFail(`Failed: ${error.message}`);
    }

    revalidatePath('/admin/users/codes');
    return actionOk({ code });
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error creating code');
  }
}

export async function revokeTeacherCode(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  try {
    const ctx = await adminCtx();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return actionFail('id required');

    const { error } = await ctx.supabase
      .from('teacher_codes')
      .delete()
      .eq('id', id);

    if (error) return actionFail(`Failed: ${error.message}`);
    revalidatePath('/admin/users/codes');
    return actionOk({});
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error revoking code');
  }
}

// setTeacherInviteCode / clearTeacherInviteCode used to live here — the
// admin management surface for the multi-use per-teacher codes. Retired
// (owner policy 2026-07-16): sponsored student intake moved to the
// single-use invitations below; the multi-use code survives only as a
// self-serve roster-only tool for outside tutors (auto-generated at
// their signup) and is rejected for Studyworks tutors.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Invite a student (owner policy 2026-07-16): generates a single-use,
 * email-bound invitation code tied to a tutor, emails it to the
 * student, and tracks it on the Codes page. A sponsored admin
 * invitation is the self-serve path to free student access (admins can
 * also sponsor a link directly on the user page); tutors issue their
 * own, never-sponsored invitations from the roster
 * (migration 20261114011641).
 */
export async function inviteStudent(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  try {
    const ctx = await adminCtx();

    const email = String(formData.get('email') ?? '').trim().toLowerCase();
    const teacherId = String(formData.get('teacher_id') ?? '');
    // Sponsored by default (the admin invitation was the sponsored
    // intake before tutors could invite); unticking it issues a plain
    // roster invitation — the student subscribes.
    const sponsored = formData.get('sponsored') === 'on';
    if (!EMAIL_RE.test(email)) return actionFail('Enter a valid email address.');
    if (!teacherId) return actionFail('Pick a tutor.');

    const { data: teacher } = await ctx.supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role, subscription_exempt')
      .eq('id', teacherId)
      .in('role', ['teacher', 'manager'])
      .maybeSingle();
    if (!teacher) return actionFail('That tutor could not be found.');
    if (sponsored && !teacher.subscription_exempt) {
      return actionFail('Only a Studyworks tutor’s students can be sponsored. Untick “Sponsored” to invite this student to subscribe.');
    }

    // An existing account is linked from its user page instead (the
    // code would also work from Account → Your teachers).
    const { data: existingUser } = await ctx.supabase
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle();
    if (existingUser) {
      return actionFail('That email already has an account. Assign them to the tutor from their user page instead.');
    }

    // One live invitation per email.
    const { data: existingInvite } = await ctx.supabase
      .from('student_invite_codes')
      .select('code')
      .ilike('email', email)
      .is('used_by', null)
      .maybeSingle();
    if (existingInvite) {
      return actionFail(`An unused invitation for this email already exists (code ${existingInvite.code}). Revoke it on the Codes page to reissue.`);
    }

    // Insert with a couple of retries in case the generated code collides.
    let code = null;
    for (let attempt = 0; attempt < 3 && !code; attempt += 1) {
      const candidate = generateCode(8);
      const { error } = await ctx.supabase
        .from('student_invite_codes')
        .insert({
          code: candidate,
          teacher_id: teacher.id,
          email,
          created_by: ctx.user.id,
          sponsored,
        });
      if (!error) {
        code = candidate;
      } else if (error.code !== '23505') {
        return actionFail(`Failed to create the invitation: ${error.message}`);
      }
    }
    if (!code) return actionFail('Could not generate a unique code — try again.');

    const teacherName =
      [teacher.first_name, teacher.last_name].filter(Boolean).join(' ') || teacher.email;
    const emailSent = await sendStudentInvitationEmail({
      email,
      code,
      teacherName,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      sponsored,
    });

    revalidatePath('/admin/users');
    revalidatePath('/admin/users/codes');
    return actionOk({ code, email, emailSent, sponsored });
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error creating the invitation');
  }
}

/** Revoke an UNUSED student invitation (claimed ones are history). */
export async function revokeStudentInvite(prevOrFD, maybeFD) {
  const formData = maybeFD instanceof FormData ? maybeFD : prevOrFD;
  try {
    const ctx = await adminCtx();
    const id = formData.get('id');
    if (typeof id !== 'string' || !id) return actionFail('id required');

    const { data: deleted, error } = await ctx.supabase
      .from('student_invite_codes')
      .delete()
      .eq('id', id)
      .is('used_by', null)
      .select('id');

    if (error) return actionFail(`Failed: ${error.message}`);
    if (!deleted?.length) return actionFail('That invitation was already claimed or no longer exists.');
    revalidatePath('/admin/users/codes');
    return actionOk({});
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail(err?.message ?? 'Unexpected error revoking the invitation');
  }
}
