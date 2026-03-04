import { redirect } from 'next/navigation';
import { getUserWithProfile } from '../lib/db';
import LandingClient from '../components/LandingClient';

export default async function HomePage() {
  const { user, profile } = await getUserWithProfile();
  if (user) {
    redirect(profile?.role === 'practice' ? '/practice' : '/dashboard');
  }
  return <LandingClient />;
}
