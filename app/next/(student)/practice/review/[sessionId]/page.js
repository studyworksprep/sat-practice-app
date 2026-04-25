// Session review page — post-session performance report plus
// per-question review.
//
// URL: /practice/review/[sessionId]
//
// Loaded on session complete (from the practice runner's handleNext
// on the last question) and from the practice-history list. The
// whole session is pre-rendered into a single view model — all
// questions, the student's initial answer per question, and the
// correct-answer + rationale for each — so the client island can
// switch questions without any further network round-trip. That's
// consistent with the architecture-plan §3.7 principle (no
// useEffect + fetch; server-render everything the client needs).
//
// The view-model build itself lives in lib/practice/
// build-session-review.js so the tutor training-mode review page
// can share it. This page only owns auth + the student-tree
// session lookup.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { ReviewInteractive } from '@/lib/practice/ReviewInteractive';
import { buildSessionReview } from '@/lib/practice/build-session-review';

export const dynamic = 'force-dynamic';

export default async function PracticeReviewPage({ params }) {
  const { sessionId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Session row. RLS pins this to the owning user; a stray
  // session id belonging to someone else just 404s.
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, mode, filter_criteria')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) notFound();
  if (session.user_id !== user.id) notFound();

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();

  const {
    sessionMeta, items, metrics, timing, assignment,
    desmosCanSave, conceptTagsCatalog, conceptTagsCanTag, conceptTagsCanDelete,
  } = await buildSessionReview({ supabase, user, role: profile.role, session });

  return (
    <ReviewInteractive
      sessionMeta={sessionMeta}
      items={items}
      metrics={metrics}
      timing={timing}
      assignment={assignment}
      desmosCanSave={desmosCanSave}
      conceptTagsCatalog={conceptTagsCatalog}
      conceptTagsCanTag={conceptTagsCanTag}
      conceptTagsCanDelete={conceptTagsCanDelete}
    />
  );
}
