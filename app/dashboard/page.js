import { redirect } from 'next/navigation';
import { getUser } from '../../lib/db';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect('/');
  return <DashboardClient email={user.email} />;
}
