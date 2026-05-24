// Root of the rebuild tree. The proxy now defaults to the next
// tree for every visitor, so this page is the marketing landing
// for unauthenticated traffic and a redirect hub for everyone
// signed in. Logged-out callers see HomeClient (the new-tree
// login + signup surface). Logged-in callers bounce to the
// role-appropriate home.
//
// `?confirmed=true` and `?confirmed=error` ride through from the
// auth callback so the success/failure banner inside HomeClient
// can render even after the callback set a session — we render
// the landing instead of redirecting in that case so the user
// sees the confirmation message before logging in.

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/api/auth';
import { maybeSendWelcomeEmail } from '@/lib/email/maybeSendWelcomeEmail';
import { HomeClient } from './HomeClient';

export const dynamic = 'force-dynamic';

export default async function NextTreeRoot(props) {
  const searchParams = await props.searchParams;
  const confirmed = searchParams?.confirmed;

  // Email-confirmation landing — render the form even if a session
  // exists from the callback, so the user sees the success banner
  // and chooses to log in. Mirrors the legacy app/page.js behavior.
  if (confirmed === 'true') {
    return <HomeClient emailConfirmed />;
  }
  if (confirmed === 'error') {
    return <HomeClient emailConfirmed="error" />;
  }

  let user = null;
  let profile = null;
  try {
    ({ user, profile } = await requireUser());
  } catch {
    // No session — fall through to the landing page below.
  }

  // Post-confirmation welcome email. Supabase's verify endpoint
  // 302-redirects here with a session cookie set, which is the
  // only reliable signal we get that a new student just confirmed.
  // The helper is idempotent (gated on
  // profiles.welcome_email_sent_at IS NULL) so re-renders are
  // harmless.
  if (user) {
    const hdrs = await headers();
    const proto = hdrs.get('x-forwarded-proto') || 'https';
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
    const origin = host ? `${proto}://${host}` : undefined;
    await maybeSendWelcomeEmail({ userId: user.id, email: user.email, origin });
  }

  if (profile) {
    const role = profile.role;
    const dest =
      role === 'admin' ? '/admin'
      : role === 'teacher' || role === 'manager' ? '/tutor/dashboard'
      : role === 'practice' ? '/practice'
      : '/dashboard';
    redirect(dest);
  }

  return <HomeClient />;
}
