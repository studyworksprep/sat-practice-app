// Assignment detail (Server Component). Branches on assignment_type
// to render the appropriate UI. The product framing from the
// session handoff:
//
//   "The panel that says 'Assignments' on a student's dashboard
//    should feel consistent: that's where the assignment appears.
//    The panel just queries one table, identifies the type, and
//    renders whatever visual element belongs to that assignment type."
//
// Per-type rendering:
//
//   'questions'     — shows the question list with per-question done/
//                     correct state computed from attempts, plus a
//                     Start/Continue button that creates a session
//                     and redirects into /practice/s/<sid>/0.
//
//   'practice_test' — shows a launch link to the existing
//                     /practice-test?test=<id> route. That flow
//                     lives in the legacy tree for now; for users
//                     on ui_version='next' it will hit the catch-
//                     all until practice-test is rebuilt. Known
//                     limitation, documented here.
//
//   'lesson'        — shows the lesson title + description. Lessons
//                     are not fully implemented yet; the row is
//                     included from day one so the teacher
//                     assignment-creation flow doesn't have to
//                     special-case its absence.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/lib/ui/Button';
import { startAssignmentPractice } from './actions';
import { StartAssignmentButton } from './AssignmentInteractive';

export const dynamic = 'force-dynamic';

export default async function AssignmentDetailPage({ params }) {
  const resolvedParams = await params;
  const assignmentId = resolvedParams?.id;
  if (!assignmentId) notFound();

  const { user, profile, supabase } = await requireUser();
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Parent row + the caller's junction row, in parallel. RLS on
  // assignments_v2 scopes the parent to rows the caller can see
  // (student via child, admin, or teacher via can_view). The
  // junction row narrows to "is the caller a student of this?",
  // which we need to require here — teachers/admins fall through
  // to notFound() because their view lives under /tutor/...
  const [parentRes, enrolledRes] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select(`
        id,
        teacher_id,
        assignment_type,
        title,
        description,
        due_date,
        archived_at,
        deleted_at,
        question_ids,
        filter_criteria,
        lesson_id,
        practice_test_id,
        lesson:lessons (id, title, description),
        practice_test:practice_tests_v2 (id, code, name)
      `)
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select('completed_at')
      .eq('assignment_id', assignmentId)
      .eq('student_id', user.id)
      .maybeSingle(),
  ]);

  const assignment = parentRes.data;
  const enrolled = enrolledRes.data;

  if (!assignment || assignment.deleted_at) notFound();
  if (!enrolled) notFound();

  // Teacher name via profile_cards (students can't SELECT profiles
  // directly — the forward can_view policy is downward only).
  const { data: teacherCard } = await supabase
    .from('profile_cards')
    .select('first_name, last_name')
    .eq('id', assignment.teacher_id)
    .maybeSingle();
  assignment.teacher = teacherCard ?? null;

  // For 'questions' assignments, fetch taxonomy + the student's
  // attempt history for each question in parallel. Done here (not
  // in a sub-component) so the page matches the codebase convention
  // of fetching in the top-level async page function.
  //
  // We read per-question state from `attempts` directly rather than
  // `question_status` — the legacy RPC that maintains question_status
  // may not exist in every environment, and attempts is the
  // authoritative source. Client-side reduction picks the most
  // recent attempt per question for the ✓/✗ display.
  let questionRows = null;
  if (assignment.assignment_type === 'questions') {
    const questionIds = Array.isArray(assignment.question_ids) ? assignment.question_ids : [];
    if (questionIds.length > 0) {
      const [qRes, aRes] = await Promise.all([
        supabase
          .from('questions_v2')
          .select('id, domain_name, skill_name, difficulty')
          .in('id', questionIds),
        supabase
          .from('attempts')
          .select('question_id, is_correct, created_at')
          .eq('user_id', user.id)
          .in('question_id', questionIds)
          .order('created_at', { ascending: false }),
      ]);
      const byId = new Map((qRes.data ?? []).map((q) => [q.id, q]));
      const latestByQ = new Map();
      for (const a of aRes.data ?? []) {
        if (!latestByQ.has(a.question_id)) latestByQ.set(a.question_id, a);
      }
      questionRows = questionIds.map((qid, i) => {
        const q = byId.get(qid) ?? { id: qid };
        const latest = latestByQ.get(qid) ?? null;
        return {
          ordinal: i + 1,
          question_id: qid,
          domain_name: q.domain_name ?? null,
          skill_name: q.skill_name ?? null,
          difficulty: q.difficulty ?? null,
          is_done: latest != null,
          is_correct: latest?.is_correct ?? null,
        };
      });
    } else {
      questionRows = [];
    }
  }

  const teacherName = assignment.teacher
    ? [assignment.teacher.first_name, assignment.teacher.last_name].filter(Boolean).join(' ')
    : null;
  const title = displayTitle(assignment);
  const isOverdue =
    assignment.due_date &&
    enrolled.completed_at == null &&
    Date.parse(assignment.due_date) < Date.now();

  return (
    <main style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <Link
        href="/assignments"
        style={{ color: '#4b5563', textDecoration: 'none', fontSize: '0.875rem' }}
      >
        ← All assignments
      </Link>

      <header style={{ marginTop: '1rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          {title}
        </h1>
        {assignment.description && (
          <p style={{ color: '#4b5563', marginTop: 0 }}>{assignment.description}</p>
        )}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
          {teacherName && <span>Assigned by {teacherName}</span>}
          {assignment.due_date && (
            <span style={{ color: isOverdue ? '#b91c1c' : undefined }}>
              Due {formatDate(assignment.due_date)}{isOverdue ? ' (overdue)' : ''}
            </span>
          )}
          {enrolled.completed_at && (
            <span style={{ color: '#15803d', fontWeight: 600 }}>
              Completed {formatDate(enrolled.completed_at)}
            </span>
          )}
        </div>
      </header>

      <section style={{ marginTop: '1.5rem' }}>
        {assignment.assignment_type === 'questions' && (
          <QuestionsView
            assignment={assignment}
            rows={questionRows ?? []}
            completed={enrolled.completed_at != null}
          />
        )}
        {assignment.assignment_type === 'practice_test' && (
          <PracticeTestView assignment={assignment} />
        )}
        {assignment.assignment_type === 'lesson' && (
          <LessonView assignment={assignment} />
        )}
      </section>
    </main>
  );
}

function QuestionsView({ assignment, rows, completed }) {
  if (rows.length === 0) {
    return <p style={{ color: '#6b7280' }}>This assignment has no questions.</p>;
  }

  const doneCount = rows.filter((r) => r.is_done).length;
  const correctCount = rows.filter((r) => r.is_done && r.is_correct).length;
  const total = rows.length;
  const allDone = doneCount === total && total > 0;

  return (
    <>
      <section style={{
        display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap',
        padding: '1rem', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8,
      }}>
        <Stat label="Progress" value={`${doneCount} / ${total}`} />
        {doneCount > 0 && (
          <Stat label="Accuracy" value={`${Math.round((correctCount / doneCount) * 100)}%`} />
        )}
        <div style={{ flex: 1 }} />
        <StartAssignmentButton
          assignmentId={assignment.id}
          label={allDone ? 'Review' : doneCount > 0 ? `Continue (${total - doneCount} left)` : 'Start'}
          disabled={completed}
          startAction={startAssignmentPractice}
        />
      </section>

      <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0 0 0', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {rows.map((r) => (
          <li key={r.question_id} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.5rem 0.75rem', borderRadius: 6,
            background: r.is_done ? (r.is_correct ? '#ecfdf5' : '#fef2f2') : 'transparent',
          }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
              background: r.is_done ? (r.is_correct ? '#10b981' : '#ef4444') : '#e5e7eb',
              color: r.is_done ? '#ffffff' : '#6b7280',
            }}>
              {r.is_done ? (r.is_correct ? '✓' : '✗') : r.ordinal}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{r.domain_name ?? 'Question'}</span>
              {r.skill_name && (
                <span style={{ color: '#6b7280', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
                  {r.skill_name}
                </span>
              )}
            </div>
            {r.difficulty != null && (
              <span style={{
                fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: 999,
                background: difficultyColor(r.difficulty), color: 'white',
              }}>
                {difficultyLabel(r.difficulty)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function PracticeTestView({ assignment }) {
  const pt = assignment.practice_test;
  const sections = assignment.filter_criteria?.sections;
  const qs = new URLSearchParams({ test: assignment.practice_test_id });
  if (sections && sections !== 'both') qs.set('sections', sections);

  return (
    <section style={{
      padding: '1.5rem', border: '1px solid #e5e7eb', borderRadius: 8,
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
        {pt?.name ?? 'Practice Test'}
      </h2>
      {pt?.code && (
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Code: {pt.code}</div>
      )}
      {sections && sections !== 'both' && (
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Section: {sections.toUpperCase()} only
        </div>
      )}
      <Button
        href={`/practice-test?${qs.toString()}`}
        external
        style={{ alignSelf: 'flex-start' }}
      >
        Launch practice test
      </Button>
    </section>
  );
}

function LessonView({ assignment }) {
  const lesson = assignment.lesson;
  return (
    <section style={{
      padding: '1.5rem', border: '1px solid #e5e7eb', borderRadius: 8,
      display: 'flex', flexDirection: 'column', gap: '0.75rem',
    }}>
      <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
        {lesson?.title ?? 'Lesson'}
      </h2>
      {lesson?.description && (
        <p style={{ color: '#4b5563', margin: 0 }}>{lesson.description}</p>
      )}
      {assignment.lesson_id && (
        <Button
          href={`/lessons/${assignment.lesson_id}`}
          external
          style={{ alignSelf: 'flex-start' }}
        >
          Open lesson
        </Button>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function displayTitle(a) {
  if (a.title) return a.title;
  if (a.assignment_type === 'lesson') return a.lesson?.title ?? 'Lesson';
  if (a.assignment_type === 'practice_test') return a.practice_test?.name ?? 'Practice Test';
  return 'Assignment';
}

function difficultyLabel(d) {
  return { 1: 'Easy', 2: 'Medium', 3: 'Hard' }[d] ?? '?';
}

function difficultyColor(d) {
  return { 1: '#10b981', 2: '#f59e0b', 3: '#ef4444' }[d] ?? '#9ca3af';
}
