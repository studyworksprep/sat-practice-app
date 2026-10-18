import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { loadActTestResults } from '@/lib/practice-test/load-act-test-results';
import { actSectionReviewPath, scopeActReviewSession } from '@/lib/practice-test/act-review-navigation';
import { buildActSessionReview } from '@/lib/practice/build-act-session-review';
import { ReviewInteractive } from '@/lib/practice/ReviewInteractive';
import { isActSection } from '@/lib/practice/act-taxonomy';

export const dynamic = 'force-dynamic';

export default async function ActSectionReviewPage({
  params,
}: {
  params: Promise<{ attemptId: string; section: string }>;
}) {
  const { attemptId, section } = await params;
  const { user, profile, supabase } = await requireUser();
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');
  if (!isActSection(section)) notFound();

  const result = await loadActTestResults({ supabase, attemptId });
  if (!result.ok) {
    if (result.code === 'in-progress' && result.attempt.userId === user.id) {
      redirect(`/practice/test/act/attempt/${attemptId}`);
    }
    notFound();
  }
  if (result.attempt.userId !== user.id) notFound();
  const sectionRow = result.sectionRows.find((row) => row.section === section);
  if (!sectionRow?.sessionId) notFound();

  const { data: session, error: sessionError } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, mode, filter_criteria, marked_positions, test_type')
    .eq('id', sectionRow.sessionId)
    .eq('user_id', user.id)
    .eq('test_type', 'act')
    .maybeSingle();
  if (sessionError) throw new Error('Unable to load ACT review session.');
  if (!session || !Array.isArray(session.question_ids)) notFound();
  const questionIds = session.question_ids.filter((id): id is string => typeof id === 'string');
  if (!questionIds.length) notFound();
  const { data: questions, error: questionError } = await supabase
    .from('act_questions').select('id')
    .in('id', questionIds).eq('section', section);
  if (questionError) throw new Error('Unable to load ACT review questions.');
  const scopedSession = scopeActReviewSession(
    { ...session, question_ids: questionIds, test_type: 'act' as const },
    (questions ?? []).map((question) => question.id),
  );
  if (!scopedSession.question_ids.length) notFound();

  const review = await buildActSessionReview({
    supabase, user, role: profile.role, session: scopedSession,
  });
  const reportHref = `/practice/test/act/attempt/${attemptId}/results`;
  return (
    <ReviewInteractive
      key={section}
      {...review}
      sessionMeta={{
        ...review.sessionMeta,
        sourceTest: result.attempt.formName,
        testSection: section,
        scoreReportHref: reportHref,
        reviewSections: result.sectionRows.filter((row) => row.sessionId).map((row) => ({
          section: row.section,
          label: row.label,
          href: actSectionReviewPath(attemptId, row.section),
        })),
      }}
      footerBackHref={reportHref}
      footerBackLabel="← Back to ACT score report"
      footerNextHref="/practice/tests?test=act"
      footerNextLabel="All ACT practice tests →"
    />
  );
}
