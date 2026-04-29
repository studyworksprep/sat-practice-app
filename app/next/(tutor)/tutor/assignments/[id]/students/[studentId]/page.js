// Tutor → per-student assignment report. Renders the
// AssignmentReport for one student/trainee on one assignment,
// regardless of whether the work went through a v2
// practice_session row.
//
// Resolution order:
//   1. Latest completed v2 session for (student, assignment).
//      That's the canonical case and the report stays identical
//      to /tutor/sessions/[sessionId].
//   2. Synthetic session built from assignment.question_ids and
//      assignment.created_at. Used when the student worked the
//      questions outside the v2 runner (legacy practice flow,
//      pre-cutover imports, manual "Submit for student" without
//      a recorded session). buildSessionReview's expandLegacyIds
//      flag pulls v1 attempts back in via question_id_map, so
//      report stats line up with the cohort table.
//   3. Empty state when there are no attempts at all.
//
// Auth: tutor / manager / admin. RLS does the real authorization.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { buildSessionReview } from '@/lib/practice/build-session-review';
import { expandToAttemptIds } from '@/lib/practice/weak-queue';
import { AssignmentReport } from '@/lib/practice/AssignmentReport';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentStudentReportPage({ params }) {
  const { id: assignmentId, studentId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // Parent assignment, junction confirming the pair, owner
  // profile (drives the back-link target), and any latest
  // completed v2 session — all in parallel.
  const [
    { data: assignment },
    { data: junction },
    { data: ownerProfile },
    { data: realSession },
  ] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select('id, title, description, assignment_type, question_ids, due_date, created_at, deleted_at')
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select('student_id, completed_at, created_at')
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('id, role, first_name, last_name, email')
      .eq('id', studentId)
      .maybeSingle(),
    supabase
      .from('practice_sessions')
      .select('id, user_id, question_ids, created_at, mode, filter_criteria, status')
      .eq('user_id', studentId)
      .eq('filter_criteria->>assignment_id', assignmentId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!assignment || assignment.deleted_at) notFound();
  if (!junction) notFound();

  const ownerRole = ownerProfile?.role ?? null;
  const ownerName =
    [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(' ')
    || ownerProfile?.email
    || null;
  const ownerHomeHref =
    ownerRole === 'teacher' || ownerRole === 'manager'
      ? `/tutor/teachers/${studentId}`
      : `/tutor/students/${studentId}`;

  const questionIds = Array.isArray(assignment.question_ids)
    ? assignment.question_ids.filter(Boolean)
    : [];

  // No questions on the assignment (lesson / practice-test type, or
  // a malformed pool). Nothing to report on.
  if (questionIds.length === 0) {
    return (
      <EmptyReport
        ownerName={ownerName}
        title={assignment.title ?? 'Assignment'}
        backHref={`/tutor/assignments/${assignmentId}`}
        body="This assignment has no question pool, so there's no report to render."
      />
    );
  }

  // Path 1 — real v2 session. Same render as /tutor/sessions/[id].
  if (realSession) {
    const view = await buildSessionReview({
      supabase,
      user,
      target: { id: studentId },
      role: profile.role,
      session: realSession,
    });
    return (
      <AssignmentReport
        sessionMeta={view.sessionMeta}
        items={view.items}
        metrics={view.metrics}
        timing={view.timing}
        assignment={view.assignment}
        studentName={ownerName}
        studentHref={ownerHomeHref}
        backHref={`/tutor/assignments/${assignmentId}`}
        backLabel="← Back to assignment"
      />
    );
  }

  // Path 2 — synthetic session. Confirm the student has at
  // least one attempt on any of the assignment's questions
  // (including v1 ids that map to the same v2 question) before
  // we render a report. An empty state for "they really haven't
  // touched this yet" is friendlier than an all-Unanswered
  // report card.
  const { allIds } = await expandToAttemptIds(supabase, questionIds);
  const { count: attemptCount } = await supabase
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', studentId)
    .in('question_id', allIds)
    .gte('created_at', assignment.created_at ?? '1970-01-01');

  if (!attemptCount) {
    return (
      <EmptyReport
        ownerName={ownerName}
        title={assignment.title ?? 'Assignment'}
        backHref={`/tutor/assignments/${assignmentId}`}
        body={
          junction.completed_at
            ? "Marked complete, but no attempts on the assignment's questions are recorded yet."
            : "No attempts on this assignment yet."
        }
      />
    );
  }

  const syntheticSession = {
    id: `synthetic:${assignmentId}:${studentId}`,
    user_id: studentId,
    question_ids: questionIds,
    created_at: assignment.created_at ?? '1970-01-01T00:00:00Z',
    mode: 'practice',
    filter_criteria: { assignment_id: assignmentId },
  };

  const view = await buildSessionReview({
    supabase,
    user,
    target: { id: studentId },
    role: profile.role,
    session: syntheticSession,
    expandLegacyIds: true,
  });

  return (
    <AssignmentReport
      sessionMeta={view.sessionMeta}
      items={view.items}
      metrics={view.metrics}
      timing={view.timing}
      assignment={view.assignment}
      studentName={ownerName}
      studentHref={ownerHomeHref}
      backHref={`/tutor/assignments/${assignmentId}`}
      backLabel="← Back to assignment"
    />
  );
}

// ──────────────────────────────────────────────────────────────

function EmptyReport({ ownerName, title, backHref, body }) {
  return (
    <main style={{
      maxWidth: 720, margin: '2rem auto', padding: '0 1.5rem',
      fontFamily: 'var(--font-sans)',
    }}>
      <a href={backHref} style={{
        display: 'inline-block', marginBottom: '1rem',
        color: 'var(--fg3)', fontSize: 13, textDecoration: 'none',
      }}>← Back to assignment</a>
      <h1 style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 'var(--app-title-1)',
        fontWeight: 700,
        color: 'var(--fg1)',
        margin: 0,
      }}>{title}</h1>
      {ownerName && (
        <p style={{ color: 'var(--fg3)', marginTop: 4 }}>{ownerName}</p>
      )}
      <div style={{
        marginTop: '1.5rem',
        padding: '1.5rem',
        background: 'var(--card)',
        border: '1px dashed var(--border)',
        borderRadius: 12,
        color: 'var(--fg2)',
        fontSize: 14,
      }}>{body}</div>
    </main>
  );
}
