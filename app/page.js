import { redirect } from 'next/navigation';
import { getUserWithProfile } from '../lib/db';
import LandingClient from '../components/LandingClient';

export default async function HomePage() {
  const { user, profile } = await getUserWithProfile();
  if (user) {
    const dest =
      profile?.role === 'practice' ? '/practice' :
      profile?.role === 'teacher' || profile?.role === 'manager' ? '/teacher' :
      '/dashboard';
    redirect(dest);
  }
  return <LandingClient />;
}
