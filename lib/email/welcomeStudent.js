// Post-confirmation welcome email for newly signed-up students.
// Content mirrors the /help/getting-started article so the email
// works as a standalone orientation even if the recipient never
// clicks through.

import { getResend, getFromAddress } from './client';

export function renderWelcomeStudentEmail({ firstName, siteUrl, isExempt }) {
  const name = firstName?.trim() || 'there';
  const url = (path) => `${siteUrl}${path}`;

  const cancelSection = isExempt
    ? `
        <h2 style="font-size:18px;margin:32px 0 8px 0;color:#0f172a;">About billing</h2>
        <p style="margin:0 0 12px 0;">
          Your account is sponsored — full platform access at no cost through Studyworks Prep.
          There's no subscription to manage and nothing to cancel. If anything about your
          account access changes, you'll hear from us first.
        </p>
      `
    : `
        <h2 style="font-size:18px;margin:32px 0 8px 0;color:#0f172a;">Your subscription &amp; how to cancel</h2>
        <p style="margin:0 0 12px 0;">
          Your account starts with a 7-day free trial. You can cancel any time before the trial
          ends and won't be charged. To manage or cancel your subscription:
        </p>
        <ol style="margin:0 0 12px 0;padding-left:20px;">
          <li style="margin-bottom:6px;">Sign in and open <a href="${url('/account/billing')}" style="color:#2563eb;">Billing</a> from your account menu.</li>
          <li style="margin-bottom:6px;">Click <strong>Manage Subscription</strong>. You'll be taken to our secure billing portal.</li>
          <li style="margin-bottom:6px;">Choose <strong>Cancel plan</strong>. Access continues until the end of your current billing period.</li>
        </ol>
        <p style="margin:0 0 12px 0;">
          The same steps work for switching plans or updating your payment method. Full details
          live in the <a href="${url('/help/billing')}" style="color:#2563eb;">Billing &amp; Subscription</a> help article.
        </p>
      `;

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Welcome to Studyworks</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;line-height:1.55;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;padding:32px;">
            <tr>
              <td>
                <h1 style="font-size:24px;margin:0 0 16px 0;color:#0f172a;">Welcome to Studyworks, ${escapeHtml(name)}.</h1>
                <p style="margin:0 0 16px 0;">
                  Glad you're here. Studyworks is your home base for SAT and ACT practice, and the
                  goal of this email is to make sure you can use it confidently from day one.
                </p>

                <h2 style="font-size:18px;margin:24px 0 8px 0;color:#0f172a;">Your first week — do this</h2>
                <ol style="margin:0 0 12px 0;padding-left:20px;">
                  <li style="margin-bottom:8px;">
                    <strong>Take a baseline <a href="${url('/practice/tests')}" style="color:#2563eb;">practice test</a>.</strong>
                    It gives you a starting score and tells the platform what to recommend. The single most
                    useful thing you can do in week one.
                  </li>
                  <li style="margin-bottom:8px;">
                    <strong>Spend half an hour with your <a href="${url('/dashboard')}" style="color:#2563eb;">Dashboard</a>.</strong>
                    The Performance grid shows your accuracy on every skill — red and yellow segments are
                    where the points are hiding.
                  </li>
                  <li style="margin-bottom:8px;">
                    <strong>Run a <a href="${url('/practice/start')}" style="color:#2563eb;">Practice session</a> each weekday.</strong>
                    Pick a weak skill, do 10-15 questions. Some days it'll feel hard — that's the point.
                  </li>
                  <li style="margin-bottom:8px;">
                    <strong>Capture every miss with the right tool.</strong>
                    Flashcards for terms and formulas, Error Log for process mistakes, Notes for concepts
                    you need to actually learn. See the <a href="${url('/help/notes')}" style="color:#2563eb;">Notes guide</a>.
                  </li>
                  <li style="margin-bottom:8px;">
                    <strong>Re-test every two weeks.</strong>
                    Take another practice test, compare the score, adjust which skills you're targeting.
                  </li>
                </ol>

                <h2 style="font-size:18px;margin:32px 0 8px 0;color:#0f172a;">What's in the top nav</h2>
                <ul style="margin:0 0 12px 0;padding-left:20px;">
                  <li style="margin-bottom:6px;"><strong>Dashboard</strong> — stats, performance breakdown, what to do next.</li>
                  <li style="margin-bottom:6px;"><strong>Practice</strong> — start a self-guided session on whatever you want to work on.</li>
                  <li style="margin-bottom:6px;"><strong>Practice tests</strong> — full-length, timed, adaptive SAT or ACT.</li>
                  <li style="margin-bottom:6px;"><strong>Notes</strong> — your rich-text notes, Error Log, and Flashcards in one place.</li>
                  <li style="margin-bottom:6px;"><strong>Review</strong> — drills on your weakest skills + a study surface for pre-test days.</li>
                </ul>

                ${cancelSection}

                <h2 style="font-size:18px;margin:32px 0 8px 0;color:#0f172a;">Need a hand?</h2>
                <p style="margin:0 0 12px 0;">
                  The <a href="${url('/help')}" style="color:#2563eb;">Help section</a> has full guides on
                  every part of the platform. Start with
                  <a href="${url('/help/getting-started')}" style="color:#2563eb;">Welcome — Start Here</a>
                  or jump straight to the <a href="${url('/help/study-routine')}" style="color:#2563eb;">Study Routine</a>
                  if you don't have a tutor.
                </p>
                <p style="margin:24px 0 0 0;">
                  Good luck with prep — we built this for you.
                </p>
                <p style="margin:8px 0 0 0;">— The Studyworks team</p>
              </td>
            </tr>
          </table>
          <p style="font-size:12px;color:#64748b;margin:16px 0 0 0;text-align:center;">
            You're getting this because you just confirmed your Studyworks account.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Welcome to Studyworks, ${name}.`,
    '',
    "Glad you're here. Studyworks is your home base for SAT and ACT practice.",
    '',
    'YOUR FIRST WEEK',
    `1. Take a baseline practice test: ${url('/practice/tests')}`,
    `2. Explore your Dashboard's Performance grid: ${url('/dashboard')}`,
    `3. Run a Practice session each weekday: ${url('/practice/start')}`,
    `4. Capture every miss with the right tool — Flashcards, Error Log, or Notes. See ${url('/help/notes')}`,
    '5. Re-test every two weeks to track progress.',
    '',
    "WHAT'S IN THE TOP NAV",
    '- Dashboard — stats, performance, what to do next',
    '- Practice — self-guided sessions',
    '- Practice tests — full-length, timed, adaptive',
    '- Notes — rich-text notes, Error Log, Flashcards',
    '- Review — pre-test drills and study surface',
    '',
    isExempt
      ? 'ABOUT BILLING\nYour account is sponsored through Studyworks Prep — full access at no cost, nothing to cancel.'
      : [
          'YOUR SUBSCRIPTION & HOW TO CANCEL',
          'Your account starts with a 7-day free trial. To manage or cancel:',
          `1. Sign in and open ${url('/account/billing')}`,
          '2. Click "Manage Subscription" to open the secure billing portal',
          '3. Choose "Cancel plan" — access continues to the end of the period',
          `Full details: ${url('/help/billing')}`,
        ].join('\n'),
    '',
    `NEED HELP? Visit ${url('/help')}`,
    '',
    '— The Studyworks team',
  ].join('\n');

  return { html, text };
}

export async function sendWelcomeStudentEmail({ to, firstName, siteUrl, isExempt }) {
  const resend = getResend();
  if (!resend) {
    console.warn('[welcome-email] RESEND_API_KEY not set; skipping send');
    return { sent: false, reason: 'no_api_key' };
  }

  const { html, text } = renderWelcomeStudentEmail({ firstName, siteUrl, isExempt });

  const result = await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: 'Welcome to Studyworks — your first week',
    html,
    text,
  });

  if (result.error) {
    return { sent: false, reason: 'send_error', error: result.error };
  }
  return { sent: true, id: result.data?.id };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
