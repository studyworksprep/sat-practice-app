// Student → "More statistics". Thin auth wrapper around the
// shared StudentStatsView server component — the same view a
// tutor sees at /tutor/students/[id]/stats, just bound to the
// authenticated student's own user.id. Reuses every section
// (performance grid, weekly trend, daily activity, by-difficulty,
// per-skill table) so a student gets exactly the visibility their
// tutor has.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { StudentStatsView } from '@/lib/practice/StudentStatsView';

export const dynamic = 'force-dynamic';

export default async function StudentStatsPage() {
  const { user, profile } = await requireUser();

  // Role gate. The (student) layout enforces this too; the
  // belt-and-suspenders guard here keeps direct-URL hits safe
  // if the layout is ever bypassed.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') {
    redirect('/tutor/dashboard');
  }
  if (profile.role === 'practice') redirect('/subscribe');

  return (
    <StudentStatsView
      userId={user.id}
      backHref="/dashboard"
      backLabel="Dashboard"
      h1="Your statistics"
      subtitle="Every metric your tutor sees — performance per skill, weekly trend, daily activity, where you stand by difficulty, and a full ranked list of skills weakest-first. Use the bottom of the list to pick what to drill on next."
    />
  );
}
