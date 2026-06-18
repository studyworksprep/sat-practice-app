// Tutor → student → "More statistics". Thin auth wrapper around
// the shared StudentStatsView server component, which does the
// data load and renders every section. Every byte of layout
// here is intentionally identical to the student-facing
// /dashboard/stats page — see lib/practice/StudentStatsView.tsx.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { StudentStatsView } from '@/lib/practice/StudentStatsView';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ studentId: string }>;
}

export default async function TutorStudentStatsPage({ params }: PageProps) {
  const { studentId } = await params;
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
      backHref={`/tutor/students/${studentId}`}
      // backLabel + h1 default to the student's name, loaded
      // inside the view from student_practice_stats. Subtitle
      // call-out tells the tutor what they're looking at.
      subtitle="Everything the student sees on their own dashboard, plus tutor-only rollups (daily activity, by-difficulty, full per-skill list)."
    />
  );
}
