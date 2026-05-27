// Internal signup notifications:
//   - sendAdminSignupNotification: pings the admin inbox every time
//     a new user signs up, so the team has live visibility on the
//     funnel (including signups that never confirm their email).
//   - sendTeacherNewStudentNotification: pings a teacher when a
//     student signs up with that teacher's invite code, so the
//     teacher knows a new student is on their roster.
//
// Both are soft failures — if Resend isn't configured or the send
// errors out, the signup flow still succeeds.

import { getResend, getFromAddress } from './client';

function getAdminEmail() {
  return process.env.ADMIN_NOTIFICATION_EMAIL || 'julio@studyworksprep.com';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label, value) {
  if (value === undefined || value === null || value === '') return null;
  return { label, value: String(value) };
}

function renderRowsHtml(rows) {
  return rows
    .filter(Boolean)
    .map(
      ({ label, value }) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px;">${escapeHtml(label)}</td><td style="padding:4px 0;color:#0f172a;font-size:14px;">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
}

function renderRowsText(rows) {
  return rows
    .filter(Boolean)
    .map(({ label, value }) => `${label}: ${value}`)
    .join('\n');
}

export function renderAdminSignupEmail(details) {
  const {
    email,
    firstName,
    lastName,
    userType,
    highSchool,
    graduationYear,
    targetSatScore,
    teacherCode,
    teacherEmail,
    subscriptionExempt,
  } = details;

  const rows = [
    row('Name', `${firstName ?? ''} ${lastName ?? ''}`.trim()),
    row('Email', email),
    row('User type', userType),
    row('High school', highSchool),
    row('Graduation year', graduationYear),
    row('Target SAT score', targetSatScore),
    row('Teacher code', teacherCode),
    row('Linked teacher', teacherEmail),
    row('Subscription exempt', subscriptionExempt ? 'yes' : null),
    row('Signed up at', new Date().toISOString()),
  ];

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <tr><td>
      <h1 style="font-size:18px;margin:0 0 16px 0;">New Studyworks signup</h1>
      <table role="presentation" cellpadding="0" cellspacing="0">${renderRowsHtml(rows)}</table>
    </td></tr>
  </table>
</body></html>`;

  const text = ['New Studyworks signup', '', renderRowsText(rows)].join('\n');

  return { html, text };
}

export function renderTeacherNewStudentEmail(details) {
  const {
    teacherFirstName,
    studentFirstName,
    studentLastName,
    studentEmail,
    highSchool,
    graduationYear,
    targetSatScore,
    siteUrl,
  } = details;

  const studentName = `${studentFirstName ?? ''} ${studentLastName ?? ''}`.trim() || studentEmail;
  const greeting = teacherFirstName?.trim() ? `Hi ${teacherFirstName.trim()},` : 'Hi,';
  const url = (path) => `${siteUrl || 'https://www.studyworks.io'}${path}`;

  const rows = [
    row('Name', studentName),
    row('Email', studentEmail),
    row('High school', highSchool),
    row('Graduation year', graduationYear),
    row('Target SAT score', targetSatScore),
  ];

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;line-height:1.55;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
    <tr><td>
      <h1 style="font-size:20px;margin:0 0 12px 0;">You have a new student</h1>
      <p style="margin:0 0 16px 0;">${escapeHtml(greeting)} a new student just signed up using your Studyworks invite code.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">${renderRowsHtml(rows)}</table>
      <p style="margin:0 0 12px 0;">They'll appear on your <a href="${url('/teacher')}" style="color:#2563eb;">teacher dashboard</a> once they confirm their email.</p>
      <p style="margin:16px 0 0 0;">— The Studyworks team</p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    'You have a new student',
    '',
    `${greeting} a new student just signed up using your Studyworks invite code.`,
    '',
    renderRowsText(rows),
    '',
    `They'll appear on your teacher dashboard once they confirm their email: ${url('/teacher')}`,
    '',
    '— The Studyworks team',
  ].join('\n');

  return { html, text };
}

export async function sendAdminSignupNotification(details) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn('[signup-notify] RESEND_API_KEY not set; skipping admin notification');
      return { sent: false, reason: 'no_api_key' };
    }
    const to = getAdminEmail();
    if (!to) return { sent: false, reason: 'no_admin_email' };

    const { html, text } = renderAdminSignupEmail(details);
    const subject = `New signup: ${details.firstName ?? ''} ${details.lastName ?? ''} (${details.userType})`.trim();

    const result = await resend.emails.send({
      from: getFromAddress(),
      to,
      subject,
      html,
      text,
    });
    if (result.error) {
      console.warn('[signup-notify] admin send failed', result.error);
      return { sent: false, reason: 'send_error', error: result.error };
    }
    return { sent: true, id: result.data?.id };
  } catch (err) {
    console.error('[signup-notify] admin unexpected error', err);
    return { sent: false, reason: 'exception' };
  }
}

export async function sendTeacherNewStudentNotification(details) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn('[signup-notify] RESEND_API_KEY not set; skipping teacher notification');
      return { sent: false, reason: 'no_api_key' };
    }
    if (!details.teacherEmail) return { sent: false, reason: 'no_teacher_email' };

    const { html, text } = renderTeacherNewStudentEmail(details);
    const studentName =
      `${details.studentFirstName ?? ''} ${details.studentLastName ?? ''}`.trim() ||
      details.studentEmail;

    const result = await resend.emails.send({
      from: getFromAddress(),
      to: details.teacherEmail,
      subject: `New student on Studyworks: ${studentName}`,
      html,
      text,
    });
    if (result.error) {
      console.warn('[signup-notify] teacher send failed', result.error);
      return { sent: false, reason: 'send_error', error: result.error };
    }
    return { sent: true, id: result.data?.id };
  } catch (err) {
    console.error('[signup-notify] teacher unexpected error', err);
    return { sent: false, reason: 'exception' };
  }
}
