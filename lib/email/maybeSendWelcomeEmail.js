// Shared post-confirmation welcome-email trigger.
//
// Why this lives outside any one route: Supabase's default email-
// confirmation flow does NOT route through /auth/callback — the
// verify endpoint 302-redirects straight to the site URL with a
// session cookie set. So the "user just confirmed" signal has to
// be detected on whatever page the user lands on, which in this
// app is the home route (it redirects authenticated users onward
// to /dashboard, /teacher, etc.).
//
// The check is gated on profiles.welcome_email_sent_at IS NULL so
// it only fires once per user. The row is stamped BEFORE the send
// (with an `IS NULL` predicate) so a concurrent request can't
// double-fire. Send failures are logged and don't block the
// caller's flow.

import { createServiceClient } from '../supabase/server';
import { sendWelcomeStudentEmail } from './welcomeStudent';

export async function maybeSendWelcomeEmail({ userId, email, origin }) {
  console.error('[welcome-email] enter', { userId, email, origin });
  if (!userId || !email) {
    console.error('[welcome-email] exit: missing userId or email');
    return;
  }
  try {
    const svc = createServiceClient();
    const { data: profile, error: profileErr } = await svc
      .from('profiles')
      .select('first_name, user_type, subscription_exempt, welcome_email_sent_at')
      .eq('id', userId)
      .maybeSingle();

    console.error('[welcome-email] profile lookup', { profile, profileErr });

    if (!profile) {
      console.error('[welcome-email] exit: no profile row');
      return;
    }
    if (profile.welcome_email_sent_at) {
      console.error('[welcome-email] exit: already sent', profile.welcome_email_sent_at);
      return;
    }
    if (profile.user_type !== 'student') {
      console.error('[welcome-email] exit: user_type not student', profile.user_type);
      return;
    }

    // Stamp first so a concurrent request can't double-send. The
    // `is welcome_email_sent_at null` predicate makes the update a
    // compare-and-swap.
    const { data: stamped, error: stampErr } = await svc
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', userId)
      .is('welcome_email_sent_at', null)
      .select('id');
    console.error('[welcome-email] stamp result', { stamped, stampErr });
    if (stampErr || !stamped || stamped.length === 0) {
      console.error('[welcome-email] exit: stamp failed or no rows');
      return;
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin || 'https://www.studyworks.io';
    console.error('[welcome-email] sending', { to: email, siteUrl, isExempt: profile.subscription_exempt === true });
    const result = await sendWelcomeStudentEmail({
      to: email,
      firstName: profile.first_name,
      siteUrl,
      isExempt: profile.subscription_exempt === true,
    });
    console.error('[welcome-email] send result', result);

    if (!result.sent) {
      console.warn('[welcome-email] send skipped or failed', { userId, reason: result.reason });
    }
  } catch (err) {
    console.error('[welcome-email] unexpected error', err);
  }
}
