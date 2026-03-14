import { redirect } from 'next/navigation';
import { getUserWithProfile } from '../../lib/db';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const { user, profile } = await getUserWithProfile();
  if (!user) redirect('/');
  if (profile?.role === 'practice') redirect('/practice');
  if (profile?.role === 'teacher' || profile?.role === 'manager') redirect('/teacher');
  return <DashboardClient email={user.email} />;
}
