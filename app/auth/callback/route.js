import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../lib/supabase/server';
import { sendWelcomeStudentEmail } from '../../../lib/email/welcomeStudent';

// GET /auth/callback
// Handles the token exchange after email confirmation / OAuth /
// password-recovery redirects.
//
// Inbound shapes:
//   1. ?code=<pkce-code>  — server-side exchange via
//                           exchangeCodeForSession(). Used by
//                           email confirmation and password-reset
//                           flows.
//   2. ?next=/foo         — forwarded to after the exchange. Used
//                           by password-reset flows to land the
//                           user on /auth/update-password.
//
// The demo auto-login at /auth/demo/[persona] exchanges its
// magic-link token server-side directly (verifyOtp) and does not
// route through this callback.
//
// On the email-confirmation branch (no `next` param), the handler
// also fires a one-time welcome email for students. The send is
// gated on profiles.welcome_email_sent_at being null and the row
// is stamped *before* the send so a parallel retry can't double-
// fire. A send failure is logged but does not block the redirect.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next) return NextResponse.redirect(`${origin}${next}`);

      // Email-confirmation branch: try the welcome email once per user.
      const userId = data?.user?.id;
      const email = data?.user?.email;
      if (userId && email) {
        await maybeSendWelcomeEmail({ userId, email, origin });
      }

      return NextResponse.redirect(`${origin}/?confirmed=true`);
    }
  }

  // If no code or exchange failed, redirect to home with error
  return NextResponse.redirect(`${origin}/?confirmed=error`);
}

async function maybeSendWelcomeEmail({ userId, email, origin }) {
  try {
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from('profiles')
      .select('first_name, user_type, subscription_exempt, welcome_email_sent_at')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return;
    if (profile.welcome_email_sent_at) return;
    if (profile.user_type !== 'student') return;

    // Stamp first so a concurrent callback can't double-send.
    const { error: stampErr } = await svc
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', userId)
      .is('welcome_email_sent_at', null);
    if (stampErr) return;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;
    const result = await sendWelcomeStudentEmail({
      to: email,
      firstName: profile.first_name,
      siteUrl,
      isExempt: profile.subscription_exempt === true,
    });

    if (!result.sent) {
      console.warn('[welcome-email] send skipped or failed', { userId, reason: result.reason });
    }
  } catch (err) {
    console.error('[welcome-email] unexpected error', err);
  }
}
