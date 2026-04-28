// Tutor → student/trainee session review. Renders the same
// ReviewInteractive client island the student sees on
// /practice/review/[sessionId], but loaded against the session
// owner's data (whoever they are — student or trainee teacher)
// and gated to the tutor role.
//
// This is the canonical "report" URL anywhere in the tutor tree.
// It's reached from:
//   • /tutor/assignments/[id] — per-student "Report" link to the
//     latest completed session for that assignment
//   • /tutor/students/[studentId] — recent practice sessions list
//   • /tutor/teachers/[teacherId] — manager viewing a trainee's
//     training sessions
//
// Auth: requireUser → tutor/manager/admin only. RLS on
// practice_sessions + attempts + can_view does the real
// authorization; if the caller can't see the session owner,
// the row simply doesn't come back and we 404.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { ReviewInteractive } from '@/lib/practice/ReviewInteractive';
import { buildSessionReview } from '@/lib/practice/build-session-review';

export const dynamic = 'force-dynamic';

export default async function TutorSessionReviewPage({ params }) {
  const { sessionId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, mode, filter_criteria')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) notFound();

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();

  // Look up the session owner's role so the back-link points to
  // the right per-user page (student profile vs. teacher detail).
  // Best-effort — falls back to a generic dashboard link.
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', session.user_id)
    .maybeSingle();

  const {
    sessionMeta, items, metrics, timing, assignment,
    desmosCanSave, conceptTagsCatalog, conceptTagsCanTag, conceptTagsCanDelete,
    questionNotesCanView, questionNotesIsAdmin, currentUserId,
  } = await buildSessionReview({
    supabase,
    user,
    target: { id: session.user_id },
    role: profile.role,
    session,
  });

  const assignmentId =
    session.filter_criteria
    && typeof session.filter_criteria === 'object'
    && typeof session.filter_criteria.assignment_id === 'string'
      ? session.filter_criteria.assignment_id
      : null;

  // Default per-owner-role footer destinations. Assignment-tied
  // sessions back to the assignment page so the tutor can jump
  // between students; the non-assignment fallback goes to the
  // owner's profile page.
  const ownerRole = ownerProfile?.role ?? null;
  const ownerHomeHref =
    ownerRole === 'teacher' || ownerRole === 'manager'
      ? `/tutor/teachers/${session.user_id}`
      : `/tutor/students/${session.user_id}`;

  const footerBackHref = assignmentId
    ? `/tutor/assignments/${assignmentId}`
    : ownerHomeHref;
  const footerBackLabel = assignmentId
    ? '← Back to assignment'
    : '← Back to profile';

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
      questionNotesCanView={questionNotesCanView}
      questionNotesIsAdmin={questionNotesIsAdmin}
      currentUserId={currentUserId}
      footerBackHref={footerBackHref}
      footerBackLabel={footerBackLabel}
      footerNextHref={ownerHomeHref}
      footerNextLabel="Profile →"
    />
  );
}
