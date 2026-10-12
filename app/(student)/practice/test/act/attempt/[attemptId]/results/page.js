// ACT practice-test results page (student tree). The loader + view
// live in lib/practice-test so the tutor route can render the same
// results for one of its students; this page adds the student-side
// gates (own attempt only) and the per-section review links.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { loadActTestResults } from '@/lib/practice-test/load-act-test-results';
import { ActTestResults } from '@/lib/practice-test/ActTestResults';

export const dynamic = 'force-dynamic';

export default async function ActPracticeTestResultsPage({ params }) {
  const { attemptId } = await params;
  const { user, profile, supabase } = await requireUser();

  // Tutors reach ACT results through their own tree:
  // /tutor/students/<id>/tests/<attemptId>/results.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const result = await loadActTestResults({ supabase, attemptId });
  if (!result.ok) {
    // Still running (or abandoned): the attempt page knows where the
    // student should be.
    if (result.code === 'in-progress' && result.attempt.userId === user.id) {
      redirect(`/practice/test/act/attempt/${attemptId}`);
    }
    notFound();
  }
  // RLS already scopes the read; the explicit owner check turns a
  // stray id into a clean 404 rather than a half-rendered page.
  if (result.attempt.userId !== user.id) notFound();

  const reviewLinks = result.sectionRows
    .filter((r) => r.sessionId)
    .map((r) => ({
      label: `${r.label} review`,
      href: `/practice/review/${r.sessionId}`,
    }));

  return (
    <ActTestResults
      attempt={result.attempt}
      sectionRows={result.sectionRows}
      reviewLinks={reviewLinks}
      backHref="/practice/tests?test=act"
      backLabel="← Back to practice tests"
    />
  );
}
