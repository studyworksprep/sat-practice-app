// Shared post-confirmation welcome-email trigger.
//
// Why this lives outside any one route: Supabase's default email-
// confirmation flow does NOT route through /auth/callback — the
// verify endpoint 302-redirects straight to the site URL with a
// session cookie set. So the "user just confirmed" signal has to
// be detected on whatever page the user lands on, which in this
// app is the student-tree layout (the login form does a client-
// side push to /dashboard, so the marketing home never renders
// authed).
//
// The check is gated on profiles.welcome_email_sent_at IS NULL so
// it only fires once per user. The row is stamped BEFORE the send
// (with an `IS NULL` predicate) so a concurrent request can't
// double-fire. Send failures are logged and don't block the
// caller's flow.

import { createServiceClient } from '../supabase/server';
import { logger } from '../api/logger';
import { sendWelcomeStudentEmail } from './welcomeStudent';

export async function maybeSendWelcomeEmail({ userId, email, origin }) {
  if (!userId || !email) return;
  try {
    // Raw service client (not requireServiceRole): this fires from
    // layout render right after email confirmation, acting as the
    // system, and the send/stamp must not depend on the caller's
    // role. Emit the wrapper's audit event for parity.
    logger.info(
      { event: 'service_role_bypass', reason: 'welcome-email check+stamp', user_id: userId, caller_role: 'system' },
      'service_role_bypass',
    );
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from('profiles')
      .select('first_name, user_type, subscription_exempt, welcome_email_sent_at')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) return;
    if (profile.welcome_email_sent_at) return;
    if (profile.user_type !== 'student') return;

    // Stamp first so a concurrent request can't double-send. The
    // `is welcome_email_sent_at null` predicate makes the update a
    // compare-and-swap.
    const { data: stamped, error: stampErr } = await svc
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', userId)
      .is('welcome_email_sent_at', null)
      .select('id');
    if (stampErr || !stamped || stamped.length === 0) return;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin || 'https://www.studyworks.io';
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
