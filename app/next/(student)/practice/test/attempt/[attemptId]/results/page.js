// Practice-test results page (student tree). Thin shell — all the
// data fetching + view-model build lives in
// lib/practice-test/load-test-results.js, which is shared with the
// (tutor)-tree mirror at
// /tutor/students/[studentId]/tests/[attemptId]/results.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { loadTestResults } from '@/lib/practice-test/load-test-results';
import { TestResultsInteractive } from './TestResultsInteractive';

export const dynamic = 'force-dynamic';

export default async function PracticeTestResultsPage({ params }) {
  const { attemptId } = await params;
  const { user, profile, supabase } = await requireUser();

  // Practice-tier students can't see report content. Other roles
  // legitimately get here via the tutor-tree mirror only — the
  // (student) layout above already redirects teacher / manager /
  // admin out of this tree, so role-based redirects are unnecessary
  // here.
  if (profile.role === 'practice') redirect('/subscribe');

  const result = await loadTestResults({
    supabase,
    attemptId,
    viewerUserId: user.id,
    viewerRole: profile.role,
  });

  if (!result.ok) {
    if (result.code === 'in-progress') {
      redirect(`/practice/test/attempt/${attemptId}`);
    }
    notFound();
  }

  return <TestResultsInteractive {...result.props} />;
}
