// Tutor → training session review. Mirrors the student review at
// app/next/(student)/practice/review/[sessionId] — same data
// shape, same client island — with the role gate inverted and
// the session lookup pinned to the training-mode rows the
// teacher's own training sessions write.
//
// The view-model build lives in lib/practice/build-session-review.js
// so both pages share the same questions/attempts/metrics/timing
// pipeline. This page only owns auth + the training-tree session
// filter (mode IN ('training','review')).

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { ReviewInteractive } from '@/lib/practice/ReviewInteractive';
import { buildSessionReview } from '@/lib/practice/build-session-review';

export const dynamic = 'force-dynamic';

export default async function TutorTrainingReviewPage({ params }) {
  const { sessionId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/practice/start');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // Session row. Pinned to the caller and to training-mode so
  // this page never accidentally renders a practice-mode
  // session id with a teacher visiting from the wrong route.
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, mode, filter_criteria')
    .eq('id', sessionId)
    .in('mode', ['training', 'review'])
    .maybeSingle();

  if (!session) notFound();
  if (session.user_id !== user.id) notFound();

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();

  const { sessionMeta, items, metrics, timing, assignment } =
    await buildSessionReview({ supabase, user, session });

  return (
    <ReviewInteractive
      sessionMeta={sessionMeta}
      items={items}
      metrics={metrics}
      timing={timing}
      assignment={assignment}
    />
  );
}
