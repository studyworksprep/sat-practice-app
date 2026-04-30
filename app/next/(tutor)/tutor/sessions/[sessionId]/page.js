// Tutor → student/trainee session review. Renders an
// AssignmentReport: top-to-bottom score summary, by-domain +
// by-difficulty breakdowns, prioritized review queue (wrong +
// skipped first) with each row expandable inline. Designed to
// support a teacher running a review lesson — projection-friendly
// and skim-first.
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
import { buildSessionReview } from '@/lib/practice/build-session-review';
import { AssignmentReport } from '@/lib/practice/AssignmentReport';

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
    .select('id, user_id, question_ids, created_at, mode, filter_criteria, marked_positions')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) notFound();

  const questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
  if (questionIds.length === 0) notFound();

  // Owner profile drives the header student-name link and the
  // back-link target (student profile vs. teacher detail).
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name, email')
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

  const ownerRole = ownerProfile?.role ?? null;
  const ownerName =
    [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(' ')
    || ownerProfile?.email
    || null;
  const ownerHomeHref =
    ownerRole === 'teacher' || ownerRole === 'manager'
      ? `/tutor/teachers/${session.user_id}`
      : `/tutor/students/${session.user_id}`;

  const backHref = assignmentId
    ? `/tutor/assignments/${assignmentId}`
    : ownerHomeHref;
  const backLabel = assignmentId
    ? '← Back to assignment'
    : '← Back to profile';

  // Rebuild URL — only meaningful when the session is tied to an
  // assignment. Points at the per-trainee assignment route with
  // ?rebuild=1, which forces the synthetic-from-attempts path
  // (expandLegacyIds + every attempt on the assignment's
  // question pool).
  const rebuildHref = assignmentId
    ? `/tutor/assignments/${assignmentId}/students/${session.user_id}?rebuild=1`
    : null;

  return (
    <AssignmentReport
      sessionMeta={sessionMeta}
      items={items}
      metrics={metrics}
      timing={timing}
      assignment={assignment}
      studentName={ownerName}
      studentHref={ownerHomeHref}
      backHref={backHref}
      backLabel={backLabel}
      desmosCanSave={desmosCanSave}
      conceptTagsCatalog={conceptTagsCatalog}
      conceptTagsCanTag={conceptTagsCanTag}
      conceptTagsCanDelete={conceptTagsCanDelete}
      questionNotesCanView={questionNotesCanView}
      questionNotesIsAdmin={questionNotesIsAdmin}
      currentUserId={currentUserId}
      rebuildHref={rebuildHref}
    />
  );
}
