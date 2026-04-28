// Practice-test results page (tutor tree). Mirror of the
// (student)-tree results page — same loader, same client island,
// different layout / nav (the AppNav wrapping this page is the
// (tutor) AppNav, not the (student) one). Used when a teacher /
// manager / admin reviews one of their students' completed tests.
//
// Auth: requireRole gates this to tutor roles. RLS on
// practice_test_attempts_v2 (can_view(user_id)) enforces that the
// caller is actually allowed to see the specific student's
// attempts — if not, the loader returns 'not-found' and this page
// calls notFound().

import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { loadTestResults } from '@/lib/practice-test/load-test-results';
import { TestResultsInteractive } from
  '@/app/next/(student)/practice/test/attempt/[attemptId]/results/TestResultsInteractive';

export const dynamic = 'force-dynamic';

export default async function TutorPracticeTestResultsPage({ params }) {
  const { studentId, attemptId } = await params;
  const { user, profile, supabase } = await requireRole([
    'teacher', 'manager', 'admin',
  ]);

  const result = await loadTestResults({
    supabase,
    attemptId,
    viewerUserId: user.id,
    viewerRole: profile.role,
  });

  if (!result.ok) {
    if (result.code === 'in-progress') {
      // A tutor opened a still-in-progress attempt — no useful tutor
      // view of an active runner. Send them back to the student.
      redirect(`/tutor/students/${studentId}`);
    }
    notFound();
  }

  return <TestResultsInteractive {...result.props} />;
}
