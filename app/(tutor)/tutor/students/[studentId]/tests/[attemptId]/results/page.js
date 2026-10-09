// Practice-test results page (tutor tree). Mirror of the
// (student)-tree results page — same loader, same client island,
// different layout / nav (the AppNav wrapping this page is the
// (tutor) AppNav, not the (student) one). Used when a teacher /
// manager / admin reviews one of their students' completed tests.
// Serves both SAT (practice_test_attempts_v2) and ACT
// (act_practice_test_attempts) ids: the SAT loader runs first and
// the ACT loader is the fallback.
//
// Auth: requireRole gates this to tutor roles. RLS on
// practice_test_attempts_v2 (can_view(user_id)) enforces that the
// caller is actually allowed to see the specific student's
// attempts — if not, the loader returns 'not-found' and this page
// calls notFound().

import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { loadTestResults } from '@/lib/practice-test/load-test-results';
import { loadActTestResults } from '@/lib/practice-test/load-act-test-results';
import { ActTestResults } from '@/lib/practice-test/ActTestResults';
import { TestResultsInteractive } from
  '@/app/(student)/practice/test/attempt/[attemptId]/results/TestResultsInteractive';

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
    // Not a SAT attempt — try the ACT table. One URL shape covers
    // both so the student page's test list can link uniformly. The
    // studentId check keeps a URL from pairing one student's path
    // with another student's attempt.
    const act = await loadActTestResults({ supabase, attemptId });
    if (act.ok && act.attempt.userId === studentId) {
      return (
        <ActTestResults
          attempt={act.attempt}
          sectionRows={act.sectionRows}
          reviewHref={act.attempt.practiceSessionId
            ? `/tutor/sessions/${act.attempt.practiceSessionId}`
            : null}
          backHref={`/tutor/students/${studentId}`}
          backLabel="← Back to student"
        />
      );
    }
    notFound();
  }

  return <TestResultsInteractive {...result.props} />;
}
