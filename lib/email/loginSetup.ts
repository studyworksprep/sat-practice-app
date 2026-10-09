// Login setup email — sent by an admin from the user page so a student
// whose account was created for them can choose a password and sign in.
// Lessonworks provisioning creates the account with a random password
// and tells nobody; until now the student's only way in was to guess
// that "Forgot password?" applies to them.
//
// The link carries OUR OWN signed setup token, valid for 48 hours
// (LOGIN_SETUP_LINK_TTL_MS), and points at /auth/setup. Pressing the
// button there POSTs to /auth/setup/verify, which checks the token and
// only then mints a Supabase recovery token (auth.admin.generateLink)
// and verifies it server-side in the same request, landing the student
// on /auth/update-password with a session — the same page "Forgot
// password?" ends on. Why not email the recovery token directly, as the
// first version did: its lifetime is Supabase's project-wide email OTP
// expiry, which is shared with "Forgot password?" and capped at 24
// hours, and a first-sign-in link needs to survive a weekend in an
// inbox. The Supabase token now lives for seconds, inside one request.
//
// The token is stateless (HMAC over user id, login email, a nonce, and
// the expiry) and single-use through the nonce: issuing a link stores
// the nonce in the auth user's app_metadata.login_setup, verifying
// requires a match, and a successful verify clears it. Resending
// therefore invalidates every earlier link, and changing the login
// email does too, since the email is in the signed payload. Supabase
// never sends anything itself; this module renders and sends the email
// through Resend like the other senders here.
//
// Soft failure like every sender in this module family: a false return
// means the admin UI says so, and the student can still use "Forgot
// password?" themselves.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getResend, getFromAddress } from './client.js';
import { LOGIN_SETUP_LINK_TTL_MS, LOGIN_SETUP_LINK_TTL_LABEL } from './loginSetupLink.ts';

/** Auth address stamped by Lessonworks provisioning when the student
 *  record had no email (app/api/public/students/provision/route.js).
 *  Nothing sent there is ever read. */
export const PLACEHOLDER_EMAIL_SUFFIX = '@provisioned.studyworks.local';

export { LOGIN_SETUP_LINK_TTL_MS, LOGIN_SETUP_LINK_TTL_LABEL };

/** Key in the auth user's app_metadata that tracks the current link. */
export const LOGIN_SETUP_METADATA_KEY = 'login_setup';

export interface LoginSetupMetadata {
  /** When the admin last sent a setup email. */
  sent_at: string;
  /** Present while the latest link is unused; cleared when it is spent. */
  nonce?: string | null;
  /** When a setup link was last used to sign in. */
  used_at?: string | null;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

/** The signed payload inside a setup link. */
export interface LoginSetupToken {
  v: 1;
  /** auth user id */
  u: string;
  /** login email at issue time, lowercased */
  e: string;
  /** nonce stored in app_metadata.login_setup.nonce */
  n: string;
  /** issued at, epoch ms */
  iat: number;
  /** expires at, epoch ms */
  exp: number;
}

const TOKEN_PREFIX = 'login-setup-v1:';

/** Server-only signing key. A dedicated secret when configured, else
 *  the service-role key — the same fallback the import review tokens
 *  use. Empty means links cannot be issued or verified. */
export function loginSetupSecret(): string {
  return process.env.LOGIN_SETUP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function newLoginSetupNonce(): string {
  return randomBytes(16).toString('hex');
}

function signature(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(TOKEN_PREFIX).update(body).digest();
}

export function signLoginSetupToken(
  fields: { userId: string; email: string; nonce: string },
  secret: string,
  now = Date.now(),
): string {
  if (!secret) throw new Error('login setup: no signing secret configured');
  const payload: LoginSetupToken = {
    v: 1,
    u: fields.userId,
    e: fields.email.trim().toLowerCase(),
    n: fields.nonce,
    iat: now,
    exp: now + LOGIN_SETUP_LINK_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signature(body, secret).toString('base64url')}`;
}

/** Verify the signature and the expiry. Returns null for anything that
 *  is not a currently valid token; the caller still has to match the
 *  user's current email and nonce. */
export function readLoginSetupToken(
  token: unknown,
  secret: string,
  now = Date.now(),
): LoginSetupToken | null {
  if (!secret || typeof token !== 'string' || token.length === 0 || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = signature(parts[0], secret);
  let supplied: Buffer;
  try {
    supplied = Buffer.from(parts[1], 'base64url');
  } catch {
    return null;
  }
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (
    p.v !== 1 ||
    typeof p.u !== 'string' ||
    typeof p.e !== 'string' ||
    typeof p.n !== 'string' ||
    typeof p.iat !== 'number' ||
    typeof p.exp !== 'number'
  ) {
    return null;
  }
  if (p.exp <= now) return null;
  return { v: 1, u: p.u, e: p.e, n: p.n, iat: p.iat, exp: p.exp };
}

/** The link the email carries: the setup interstitial with the signed
 *  token, spent only when the student presses the button there. */
export function buildLoginSetupUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({ token });
  return `${base}/auth/setup?${params.toString()}`;
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface LoginSetupEmailDetails {
  to: string;
  firstName: string | null;
  setupUrl: string;
  loginUrl: string;
}

export function renderLoginSetupEmail({
  to,
  firstName,
  setupUrl,
  loginUrl,
}: LoginSetupEmailDetails): { subject: string; html: string; text: string } {
  const subject = 'Set your Studyworks password';
  const greeting = firstName && firstName.trim() ? `Hi ${firstName.trim()},` : 'Hi,';
  const ttl = LOGIN_SETUP_LINK_TTL_LABEL;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <tr><td>
      <h1 style="font-size:18px;margin:0 0 12px 0;">Set your Studyworks password</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        ${escapeHtml(greeting)} a Studyworks practice account is ready for you. Use the
        button below to choose a password, then you can sign in any time.
      </p>
      <p style="margin:0 0 20px 0;">
        <a href="${escapeHtml(setupUrl)}" style="display:inline-block;padding:12px 24px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Set my password</a>
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 8px 0;">
        Your login email is <strong>${escapeHtml(to)}</strong>.
      </p>
      <p style="font-size:13px;line-height:1.6;color:#475569;margin:0 0 8px 0;">
        The button works for ${ttl}. If it has stopped working, go to
        <a href="${escapeHtml(loginUrl)}" style="color:#102a43;">${escapeHtml(loginUrl)}</a>,
        enter this email, and click &ldquo;Forgot password?&rdquo; to get a new link.
      </p>
      <p style="font-size:12px;color:#64748b;margin:16px 0 0 0;">
        If you weren&rsquo;t expecting this, you can ignore this email.
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    'Set your Studyworks password',
    '',
    `${greeting} a Studyworks practice account is ready for you. Open the link below to choose a password, then you can sign in any time.`,
    '',
    `Set my password: ${setupUrl}`,
    '',
    `Your login email is ${to}.`,
    '',
    `The link works for ${ttl}. If it has stopped working, go to ${loginUrl}, enter this email, and click "Forgot password?" to get a new link.`,
    '',
    "If you weren't expecting this, you can ignore this email.",
  ].join('\n');

  return { subject, html, text };
}

/** @returns true when the email was handed to Resend successfully. */
export async function sendLoginSetupEmail(details: LoginSetupEmailDetails): Promise<boolean> {
  try {
    const resend = getResend();
    if (!resend) return false;
    const { subject, html, text } = renderLoginSetupEmail(details);
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: details.to,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('[loginSetup] send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[loginSetup] send threw:', err);
    return false;
  }
}
