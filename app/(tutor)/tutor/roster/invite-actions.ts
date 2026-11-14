'use server';

// Tutor → Roster → "Invite a student" (migration 20261114011641).
//
// Any tutor — a Studyworks tutor or an outside, paying one — can email
// a student a single-use invitation code. Redeeming it at signup (or
// later under Account → Your teachers) puts the student on this
// tutor's roster. It NEVER sponsors: the student subscribes. Free
// access comes only from an admin-sponsored link, and the database
// enforces that (create_student_invitation always writes
// sponsored = false; guard_link_sponsorship rejects anything else).
//
// The RPC owns the rules — role, demo lockout, email format, one live
// code per tutor + email (handed back so we resend it), and a cap of
// 25 new invitations per tutor per 24 hours. This file generates the
// code, sends the email, and reports the code inline so the tutor can
// pass it on by hand when the email can't be sent.

import { revalidatePath } from 'next/cache';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { sendStudentInvitationEmail } from '@/lib/email/studentInvitation';
import type { ActionResult } from '@/lib/types';

// Same alphabet as the admin-issued invitations (no 0/O, 1/I/L); the
// RPC rejects anything else.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

interface InvitationRpcResult {
  ok?: boolean;
  error?: string;
  retry?: boolean;
  code?: string;
  email?: string;
  reused?: boolean;
}

export interface InviteStudentData {
  code: string;
  email: string;
  emailSent: boolean;
  reused: boolean;
}

export async function inviteStudentToRoster(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ data: InviteStudentData }>> {
  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
    assertWriter(ctx);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const email = String(formData.get('email') ?? '').trim();
  if (!email) return actionFail('Enter the student’s email address.');

  let result: InvitationRpcResult | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await ctx.supabase.rpc('create_student_invitation', {
      p_email: email,
      p_code: generateCode(),
    });
    if (error) return actionFail(`Could not create the invitation: ${error.message}`);
    result = (data ?? null) as InvitationRpcResult | null;
    if (!result?.retry) break;
  }
  if (!result?.ok || !result.code || !result.email) {
    return actionFail(result?.error ?? 'Could not create the invitation. Try again.');
  }

  const { data: me } = await ctx.supabase
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('id', ctx.user.id)
    .maybeSingle();
  const teacherName =
    [me?.first_name, me?.last_name].filter(Boolean).join(' ') || me?.email || 'Your tutor';

  const emailSent = await sendStudentInvitationEmail({
    email: result.email,
    code: result.code,
    teacherName,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    sponsored: false,
  });

  revalidatePath('/tutor/roster');
  return actionOk({
    code: result.code,
    email: result.email,
    emailSent,
    reused: result.reused === true,
  });
}

/** Revoke one of this tutor's unused invitations. RLS
 *  (student_invite_codes_issuer_delete) limits the delete to the
 *  caller's own, unclaimed codes. */
export async function revokeRosterInvitation(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<{ data: { id: string } }>> {
  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
    assertWriter(ctx);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return actionFail('id required');

  const { data: deleted, error } = await ctx.supabase
    .from('student_invite_codes')
    .delete()
    .eq('id', id)
    .is('used_by', null)
    .select('id');
  if (error) return actionFail(`Could not revoke: ${error.message}`);
  if (!deleted?.length) return actionFail('That invitation was already used or no longer exists.');

  revalidatePath('/tutor/roster');
  return actionOk({ id });
}
