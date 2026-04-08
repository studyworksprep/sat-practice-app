import { redirect } from 'next/navigation';
import { getUserWithProfile } from '../lib/db';
import LandingClient from '../components/LandingClient';

export default async function HomePage({ searchParams }) {
  const confirmed = searchParams?.confirmed;
  const { user, profile } = await getUserWithProfile();

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
