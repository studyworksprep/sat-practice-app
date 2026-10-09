// Server Actions for the admin user page's "Login" section: send a
// student a set-your-password link, and change the address they sign in
// with. Both need the service role (auth.admin.*), so both go through
// requireServiceRole with the admin gate and the audit log; the target
// is re-checked to be a student or practice account that is not a demo.
//
// Why this exists: Lessonworks provisioning (app/api/public/students/
// provision/route.js) creates the auth user with a random password and
// sends nothing. A student with a real address can recover through
// "Forgot password?"; nobody tells them to. A student provisioned with
// no email gets a placeholder auth address that no email can reach, and
// the profile form only edits profiles.email, never the login. This
// closes both gaps from the page an admin already has open.

'use server';

import { revalidatePath } from 'next/cache';
import { requireServiceRole } from '@/lib/api/auth';
import { logger } from '@/lib/api/logger';
import { rateLimit } from '@/lib/api/rateLimit';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { siteUrl as canonicalSiteUrl } from '@/lib/config/site';
import {
  LOGIN_SETUP_METADATA_KEY,
  buildLoginSetupUrl,
  isPlaceholderEmail,
  loginSetupSecret,
  newLoginSetupNonce,
  sendLoginSetupEmail as deliverLoginSetupEmail,
  signLoginSetupToken,
  type LoginSetupMetadata,
} from '@/lib/email/loginSetup';
import { getResend } from '@/lib/email/client';
import type { ActionResult, Fail } from '@/lib/types';
import type { ServiceRoleContext } from '@/lib/api/auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGIN_ROLES = new Set(['student', 'practice']);

type Target = { id: string; role: string; first_name: string | null; is_demo: boolean | null };

type Authorized =
  | { ok: true; ctx: ServiceRoleContext; target: Target }
  | { ok: false; result: Fail };

/** Admin caller, rate limit, and a student/practice, non-demo target. */
async function authorize(formData: FormData, reason: string): Promise<Authorized> {
  const userId = formData.get('user_id');
  if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
    return { ok: false, result: actionFail('user_id required') };
  }
  let ctx: ServiceRoleContext;
  try {
    ctx = await requireServiceRole(`admin: ${reason} for user ${userId}`, { allowedRoles: ['admin'] });
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, result: e.toActionResult() };
    return { ok: false, result: actionFail('Unexpected error') };
  }
  const rl = await rateLimit(`admin-login-setup:${ctx.user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return { ok: false, result: actionFail('Too many login changes in a minute. Wait and try again.') };

  const { data: target, error } = await ctx.service
    .from('profiles')
    .select('id, role, first_name, is_demo')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { ok: false, result: actionFail(`Could not load the user: ${error.message}`) };
  if (!target) return { ok: false, result: actionFail('User not found.') };
  if (!LOGIN_ROLES.has(target.role)) {
    return { ok: false, result: actionFail('Only student accounts can be set up from here.') };
  }
  if (target.is_demo) return { ok: false, result: actionFail('Demo accounts have no login to set up.') };
  return { ok: true, ctx, target };
}

function emailSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || canonicalSiteUrl;
}

/**
 * Email the student a set-your-password link: our own signed token,
 * valid 48 hours, that /auth/setup/verify turns into a Supabase
 * recovery session when clicked (lib/email/loginSetup.ts explains why
 * the recovery token is not emailed directly). The nonce behind the
 * link is stored in the auth user's app_metadata, so sending again
 * retires every earlier link. Delivered by our own email so the copy
 * fits a first sign-in. Form: user_id.
 */
export async function sendLoginSetupEmail(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ data: { sentTo: string; sentAt: string } }>> {
  const auth = await authorize(formData, 'send login setup email');
  if (!auth.ok) return auth.result;
  const { ctx, target } = auth;

  if (!getResend()) {
    return actionFail('The email service is not configured on this server (RESEND_API_KEY), so nothing was sent.');
  }
  const secret = loginSetupSecret();
  if (!secret) {
    return actionFail('The server has no signing key for setup links (LOGIN_SETUP_SECRET), so nothing was sent.');
  }

  const { data: userData, error: userErr } = await ctx.service.auth.admin.getUserById(target.id);
  if (userErr || !userData?.user) {
    return actionFail(`Could not read the login account: ${userErr?.message ?? 'not found'}`);
  }
  const loginEmail = userData.user.email ?? null;
  if (!loginEmail) return actionFail('This account has no login email. Set one first.');
  if (isPlaceholderEmail(loginEmail)) {
    return actionFail('This account still has the placeholder address from Lessonworks. Set the student’s real email first.');
  }

  // Record the nonce before sending: a link whose nonce is not on
  // file is dead, so an email that goes out without the record would
  // never work, while a record without an email only waits for the
  // next send to replace it.
  const sentAt = new Date().toISOString();
  const nonce = newLoginSetupNonce();
  const meta: LoginSetupMetadata = { sent_at: sentAt, nonce, used_at: null };
  const { error: metaErr } = await ctx.service.auth.admin.updateUserById(target.id, {
    app_metadata: { [LOGIN_SETUP_METADATA_KEY]: meta },
  });
  if (metaErr) {
    return actionFail(`Could not prepare the setup link: ${metaErr.message}`);
  }

  const token = signLoginSetupToken({ userId: target.id, email: loginEmail, nonce }, secret);
  const site = emailSiteUrl();
  const sent = await deliverLoginSetupEmail({
    to: loginEmail,
    firstName: target.first_name,
    setupUrl: buildLoginSetupUrl(site, token),
    loginUrl: `${site.replace(/\/+$/, '')}/login`,
  });
  if (!sent) {
    return actionFail('The email could not be sent. The student can still use “Forgot password?” on the login page.');
  }

  logger.info(
    { event: 'admin_login_setup_email', admin_id: ctx.user.id, user_id: target.id },
    'admin_login_setup_email',
  );
  revalidatePath(`/admin/users/${target.id}`);
  return actionOk({ sentTo: loginEmail, sentAt });
}

/**
 * Change the address a student signs in with, marked confirmed, and
 * mirror it to profiles.email (nothing keeps the two in sync
 * otherwise). Form: user_id, email.
 */
export async function setLoginEmail(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ data: { email: string } }>> {
  const raw = formData.get('email');
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) return actionFail('Enter a valid email address.');
  if (isPlaceholderEmail(email)) return actionFail('That is a placeholder address, not a real one.');

  const auth = await authorize(formData, 'set login email');
  if (!auth.ok) return auth.result;
  const { ctx, target } = auth;

  const { error: authErr } = await ctx.service.auth.admin.updateUserById(target.id, {
    email,
    email_confirm: true,
  });
  if (authErr) {
    const msg = authErr.message.toLowerCase();
    if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate')) {
      return actionFail('Another account already uses that email.');
    }
    return actionFail(`Could not change the login email: ${authErr.message}`);
  }

  const { error: profileErr } = await ctx.service.from('profiles').update({ email }).eq('id', target.id);
  if (profileErr) {
    return actionFail(`The login email changed, but the profile could not be updated: ${profileErr.message}`);
  }

  logger.info(
    { event: 'admin_login_email_changed', admin_id: ctx.user.id, user_id: target.id },
    'admin_login_email_changed',
  );
  revalidatePath(`/admin/users/${target.id}`);
  return actionOk({ email });
}
