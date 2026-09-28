// Login setup email — sent by an admin from the user page so a student
// whose account was created for them can choose a password and sign in.
// Lessonworks provisioning creates the account with a random password
// and tells nobody; until now the student's only way in was to guess
// that "Forgot password?" applies to them.
//
// The link carries a password-recovery token minted with
// auth.admin.generateLink and points at the same /auth/confirm →
// /auth/confirm/verify → /auth/update-password flow the "Forgot
// password?" email uses (docs/runbook.md § Password reset flow): the
// token is verified server-side on a POST, so the link works from any
// device and survives mail-scanner prefetches. Supabase never sends
// anything itself; this module renders and sends the email through
// Resend like the other senders here.
//
// Soft failure like every sender in this module family: a false return
// means the admin UI says so, and the student can still use "Forgot
// password?" themselves.

import { getResend, getFromAddress } from './client.js';

/** Auth address stamped by Lessonworks provisioning when the student
 *  record had no email (app/api/public/students/provision/route.js).
 *  Nothing sent there is ever read. */
export const PLACEHOLDER_EMAIL_SUFFIX = '@provisioned.studyworks.local';

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(PLACEHOLDER_EMAIL_SUFFIX);
}

/** The link the email carries: the recovery interstitial with the hashed
 *  token, spent only when the student presses the button there. */
export function buildLoginSetupUrl(siteUrl: string, hashedToken: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: 'recovery',
    next: '/auth/update-password',
  });
  return `${base}/auth/confirm?${params.toString()}`;
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
        The button works for a short time. If it has stopped working, go to
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
    `The link works for a short time. If it has stopped working, go to ${loginUrl}, enter this email, and click "Forgot password?" to get a new link.`,
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
