// Student invitation email — sent when an admin invites a student from
// /admin/users (owner policy 2026-07-16: sponsored students join via
// admin-issued, single-use, email-bound codes).
//
// Soft failure like every sender in this module family: if Resend is
// unconfigured or errors, the invitation row still exists and the admin
// UI surfaces the code so it can be sent manually.

import { getResend, getFromAddress } from './client';

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
}

export function renderStudentInvitationEmail({
  code,
  teacherName,
  siteUrl,
}: StudentInvitationDetails): { subject: string; html: string; text: string } {
  const signupUrl = `${siteUrl || 'https://app.studyworksprep.com'}/login`;
  const subject = 'Your Studyworks invitation';

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <tr><td>
      <h1 style="font-size:18px;margin:0 0 12px 0;">You're invited to Studyworks</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;">
        ${escapeHtml(teacherName)} set you up with a Studyworks account for
        SAT practice. Create your account — any email you like — and enter
        your invitation code. It's personal to you and works once.
      </p>
      <p style="font-size:24px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;letter-spacing:0.12em;background:#f1f5f9;border-radius:6px;padding:12px 16px;text-align:center;margin:0 0 16px 0;">
        ${escapeHtml(code)}
      </p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 8px 0;">
        <a href="${escapeHtml(signupUrl)}" style="color:#102a43;font-weight:600;">Create your account →</a>
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
    `${teacherName} set you up with a Studyworks account for SAT practice.`,
    "Create your account — any email you like — and enter your invitation code. It's personal to you and works once.",
    '',
    `Invitation code: ${code}`,
    '',
    `Create your account: ${signupUrl}`,
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
