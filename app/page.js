import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getUserWithProfile } from '../lib/db';
import { maybeSendWelcomeEmail } from '../lib/email/maybeSendWelcomeEmail';
import LandingClient from '../components/LandingClient';

export default async function HomePage(props) {
  const searchParams = await props.searchParams;
  const confirmed = searchParams?.confirmed;
  const { user, profile } = await getUserWithProfile();

  // Post-confirmation welcome email. Supabase's default verify
  // endpoint 302-redirects here with a session cookie set, which
  // is the only reliable signal we get that a new student just
  // confirmed. The helper is idempotent (gated on
  // profiles.welcome_email_sent_at IS NULL) so re-renders are
  // harmless.
  if (user) {
    const hdrs = await headers();
    const proto = hdrs.get('x-forwarded-proto') || 'https';
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
    const origin = host ? `${proto}://${host}` : undefined;
    await maybeSendWelcomeEmail({ userId: user.id, email: user.email, origin });
  }

  // If email was just confirmed, show landing page with success message
  // (even though user is now logged in from the callback)
  if (confirmed === 'true') {
    return <LandingClient emailConfirmed />;
  }

  if (user) {
    const dest =
      profile?.role === 'practice' ? '/practice' :
      profile?.role === 'teacher' || profile?.role === 'manager' ? '/teacher' :
      '/dashboard';
    redirect(dest);
  }
  return <LandingClient emailConfirmed={confirmed === 'error' ? 'error' : undefined} />;
}
