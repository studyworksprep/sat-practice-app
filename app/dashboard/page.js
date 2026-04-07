import { redirect } from 'next/navigation';
import { getUserWithProfile } from '../../lib/db';
import DashboardClient from './DashboardClient';
import AdminDashboard from '../../components/AdminDashboard';

export default async function DashboardPage() {
  const { user, profile } = await getUserWithProfile();
  if (!user) redirect('/');
  if (profile?.role === 'practice') redirect('/practice');
  if (profile?.role === 'teacher' || profile?.role === 'manager') redirect('/teacher');
  if (profile?.role === 'admin') return <AdminDashboard />;
  const studentName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null;
  return <DashboardClient email={user.email} studentName={studentName} />;
}
