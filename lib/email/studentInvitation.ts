// Student invitation email — single-use invitation codes.
//
// Two issuers (migration 20261114011641):
//   - An admin, from /admin/users: a SPONSORED invitation — the student
//     gets free access through a Studyworks Prep tutor.
//   - A tutor, from their roster: never sponsored — the code puts the
//     student on that tutor's roster and the student subscribes.
// The copy must not promise free access for the second kind.
//
// Soft failure like every sender in this module family: if Resend is
// unconfigured or errors, the invitation row still exists and the UI
// surfaces the code so it can be sent manually.

import { getResend, getFromAddress } from './client.js';

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface StudentInvitationDetails {
  email: string;
  code: string;
  teacherName: string;
  siteUrl?: string;
  /** Admin-issued, Studyworks-sponsored invitation. Defaults to true
   *  (the admin path predates tutor-issued invitations). */
  sponsored?: boolean;
}

export function renderStudentInvitationEmail({
  code,
  teacherName,
  siteUrl,
  sponsored = true,
}: StudentInvitationDetails): { subject: string; html: string; text: string } {
  const signupUrl = `${siteUrl || 'https://app.studyworksprep.com'}/login`;
  // The tutor's name is user-entered; keep it to one line in a header.
  const subject = sponsored
    ? 'Your Studyworks invitation'
    : `${teacherName.replace(/\s+/g, ' ').trim().slice(0, 80)} invited you to Studyworks`;

  const intro = sponsored
    ? `${teacherName} set you up with a Studyworks account for SAT practice. Create your account — any email you like — and enter your invitation code. It's personal to you and works once.`
    : `${teacherName} invited you to join their roster on Studyworks for SAT and ACT practice. Create your account — any email you like — and enter your invitation code so ${teacherName} can assign work and follow your progress. The code is personal to you and works once.`;

  const billing = sponsored
    ? null
    : 'Studyworks starts with a 7-day free trial, then a monthly student subscription. You can cancel anytime.';

  const existing =
    'Already have a Studyworks account? Log in, open Account, and enter the code under "Your teachers".';

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <tr><td>
      <h1 style="font-size:18px;margin:0 0 12px 0;">You're invited to Studyworks</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        ${escapeHtml(intro)}
      </p>
      <p style="font-size:24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;letter-spacing:0.12em;background:#f1f5f9;border-radius:6px;padding:12px 16px;text-align:center;margin:0 0 16px 0;">
        ${escapeHtml(code)}
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 8px 0;">
        <a href="${escapeHtml(signupUrl)}" style="color:#102a43;font-weight:600;">Create your account →</a>
      </p>${billing ? `
      <p style="font-size:13px;line-height:1.6;color:#334155;margin:16px 0 0 0;">
        ${escapeHtml(billing)}
      </p>` : ''}
      <p style="font-size:13px;line-height:1.6;color:#334155;margin:12px 0 0 0;">
        ${escapeHtml(existing)}
      </p>
      <p style="font-size:12px;color:#64748b;margin:16px 0 0 0;">
        If you weren't expecting this, you can ignore this email.
      </p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    "You're invited to Studyworks",
    '',
    intro,
    '',
    `Invitation code: ${code}`,
    '',
    `Create your account: ${signupUrl}`,
    ...(billing ? ['', billing] : []),
    '',
    existing,
  ].join('\n');

  return { subject, html, text };
}

/** @returns true when the email was handed to Resend successfully. */
export async function sendStudentInvitationEmail(
  details: StudentInvitationDetails,
): Promise<boolean> {
  try {
    const resend = getResend();
    if (!resend) return false;
    const { subject, html, text } = renderStudentInvitationEmail(details);
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: details.email,
      subject,
      html,
      text,
    });
    if (error) {
      console.error('[studentInvitation] send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[studentInvitation] send threw:', err);
    return false;
  }
}
