// Student → Performance: the full statistics. Thin auth wrapper around
// the shared StudentStatsView server component — the same view a tutor
// sees at /tutor/students/[id]/stats, bound to the authenticated
// student's own user.id and to the sidebar's SAT/ACT choice. The
// dashboard's Progress box is the reduced version and links here.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { StudentStatsView } from '@/lib/practice/StudentStatsView';
import { parseStatsTab } from '@/lib/practice/stats-focus';
import { resolveTestType } from '@/lib/practice/test-type-server';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ tab?: string | string[]; test?: string | string[] }>;
}

export default async function StudentPerformancePage({ searchParams }: PageProps) {
  const { user, profile } = await requireUser();

  // Role gate. The (student) layout enforces this too; the
  // belt-and-suspenders guard here keeps direct-URL hits safe
  // if the layout is ever bypassed.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') {
    redirect('/tutor/dashboard');
  }
  if (profile.role === 'practice') redirect('/subscribe');

  const sp = await searchParams;
  const testParam = Array.isArray(sp.test) ? sp.test[0] : sp.test;
  const testType = await resolveTestType(testParam);

  return (
    <StudentStatsView
      userId={user.id}
      basePath="/performance"
      keepQuery={testParam === 'sat' || testParam === 'act' ? { test: testParam } : undefined}
      tab={parseStatsTab(sp.tab)}
      focus={testType}
      drill
      eyebrow={`Performance · ${testType.toUpperCase()}`}
      h1="How you're doing"
      subtitle="The same numbers your tutor sees, with what to work on first at the top."
    />
  );
}
