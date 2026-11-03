// Tutor → student → "More statistics". Thin auth wrapper around
// the shared StudentStatsView server component, which does the
// data load and renders every tab. The layout matches the
// student-facing /performance page (minus the Drill links, and
// SAT + ACT shown together) — see lib/practice/StudentStatsView.tsx.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { StudentStatsView } from '@/lib/practice/StudentStatsView';
import { parseStatsTab } from '@/lib/practice/stats-focus';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}

export default async function TutorStudentStatsPage({ params, searchParams }: PageProps) {
  const { studentId } = await params;
  const { tab } = await searchParams;
  const { profile } = await requireUser();

  // Same role gate as the detail page — direct-URL hits are
  // guarded if the layout is ever bypassed.
  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  return (
    <StudentStatsView
      userId={studentId}
      basePath={`/tutor/students/${studentId}/stats`}
      tab={parseStatsTab(tab)}
      // The tutor sees SAT and ACT together and gets no Drill links.
      focus="both"
      backHref={`/tutor/students/${studentId}`}
      // backLabel + h1 default to the student's name, loaded
      // inside the view from student_practice_stats. Subtitle
      // call-out tells the tutor what they're looking at.
      subtitle="The same numbers the student sees on their Performance page, SAT and ACT together."
    />
  );
}
