import { redirect } from 'next/navigation';
import { getUserWithProfile } from '../../../lib/db';
import StatsClient from './StatsClient';

export default async function StatsPage() {
  const { user, profile } = await getUserWithProfile();
  if (!user) redirect('/');
  if (profile?.role === 'practice') redirect('/practice');
  return <StatsClient email={user.email} />;
}
