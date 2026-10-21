import { loadTimeAccommodation } from '@/lib/practice/time-accommodation';
import { satisfiesActAssignmentScope, actAssignmentScopeLabel } from '@/lib/practice/act-assignment-scope';
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
//   'practice_test' — shows a launch link to the next-tree
//                     /practice/test/<testId> launch page, which
//                     handles attempt creation and routing into
//                     the runner. When filter_criteria.sections is
//                     'rw' or 'math' we append ?sections=<v>; the
//                     launch picker pre-fills from that but the
//                     student can still override. (Earlier revisions
//                     linked to the legacy /practice-test?test=<id>
//                     URL, retired with the v1 tree.)
//
//   'lesson'        — shows the lesson title + description. Lessons
//                     are not fully implemented yet; the row is
//                     included from day one so the teacher
//                     assignment-creation flow doesn't have to
//                     special-case its absence.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { expandToAttemptIds } from '@/lib/practice/weak-queue';
import { formatDate, isPastDueDate } from '@/lib/formatters';
import { Button } from '@/lib/ui/Button';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import { startAssignmentActTest, startAssignmentPractice } from './actions';
import { StartAssignmentButton } from './AssignmentInteractive';
import { defaultActFormName } from '@/lib/practice/act-form-names';

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
  const [parentRes, enrolledRes, latestSessionRes] = await Promise.all([
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
        created_at,
        question_ids,
        filter_criteria,
        lesson_id,
        practice_test_id,
        test_type,
        act_source_test,
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
    // Latest practice session this student has run for this
    // assignment, completed first so the Report link always
    // resolves to a finished session if one exists. Powers the
    // "View report" button when the student has already run the
    // set and the "Redo" path replaces "Start" but keeps the old
    // report reachable. The assignment_id match already pins the
    // bank (an ACT assignment's sessions are ACT sessions).
    supabase
      .from('practice_sessions')
      .select('id, status, created_at')
      .eq('user_id', user.id)
      .eq('filter_criteria->>assignment_id', assignmentId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const assignment = parentRes.data;
  const enrolled = enrolledRes.data;
  const latestSession = latestSessionRes.data;

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
  //
  // Floor: any attempt at-or-after the assignment's created_at counts
  // as in-assignment progress, regardless of context (assignment
  // runner, self-directed session, practice test). Earlier attempts
  // on the same question are excluded so a freshly-created assignment
  // starts with every question Unanswered. Same rule on the tutor
  // surfaces.
  let questionRows = null;
  // lesson_pack stores a materialized question_ids snapshot just
  // like a 'questions' assignment, so the data-loading and
  // rendering path is identical from here down.
  if (assignment.assignment_type === 'questions' || assignment.assignment_type === 'lesson_pack') {
    const questionIds = Array.isArray(assignment.question_ids) ? assignment.question_ids : [];
    if (questionIds.length > 0) {
      // ACT question sets (Phase 4B) read act_questions / act_attempts;
      // ACT has no legacy id era, so no expansion.
      const isAct = assignment.test_type === 'act';
      // Expand to include legacy v1 ids so attempts predating the
      // v2 copy still count toward this assignment's progress.
      const { allIds: attemptQuestionIds, v2ByLegacy } = isAct
        ? { allIds: questionIds, v2ByLegacy: new Map() }
        : await expandToAttemptIds(supabase, questionIds);
      const assignmentFloor = assignment.created_at ?? '1970-01-01T00:00:00Z';
      const [qRes, aRes] = await Promise.all([
        isAct
          ? supabase
              .from('act_questions')
              .select('id, section, category, difficulty')
              .in('id', questionIds)
          : supabase
              .from('questions_v2')
              .select('id, domain_name, skill_name, difficulty')
              .in('id', questionIds),
        supabase
          .from(isAct ? 'act_attempts' : 'attempts')
          .select('question_id, is_correct, created_at')
          .eq('user_id', user.id)
          .in('question_id', attemptQuestionIds)
          .gte('created_at', assignmentFloor)
          .order('created_at', { ascending: false }),
      ]);
      const byId = new Map((qRes.data ?? []).map((q) => [q.id, q]));
      const latestByQ = new Map();
      for (const a of aRes.data ?? []) {
        const key = v2ByLegacy.get(a.question_id) ?? a.question_id;
        if (!latestByQ.has(key)) latestByQ.set(key, a);
      }
      questionRows = questionIds.map((qid, i) => {
        const q = byId.get(qid) ?? { id: qid };
        const latest = latestByQ.get(qid) ?? null;
        return {
          ordinal: i + 1,
          question_id: qid,
          // ACT rows render section as the "domain" and category as
          // the "skill" so the list markup is shared.
          domain_name: isAct ? (q.section ? sectionLabel(q.section) : null) : (q.domain_name ?? null),
          skill_name: isAct ? (q.category ?? null) : (q.skill_name ?? null),
          difficulty: q.difficulty ?? null,
          is_done: latest != null,
          is_correct: latest?.is_correct ?? null,
        };
      });
    } else {
      questionRows = [];
    }
  }

  // ACT practice-test assignment (Phase 4B): the latest completed
  // attempt of the assigned form since the assignment was created
  // is the student's result for it.
  let actResultsHref = null;
  let defaultTimeMultiplier = 1;
  if (
    assignment.assignment_type === 'practice_test'
    && assignment.test_type === 'act'
    && assignment.act_source_test
  ) {
    defaultTimeMultiplier = await loadTimeAccommodation(supabase, user.id);
    const { data: actAttempts } = await supabase
      .from('act_practice_test_attempts')
      .select('id, sections, format')
      .eq('user_id', user.id)
      .eq('source_test', assignment.act_source_test)
      .eq('status', 'completed')
      .gte('started_at', assignment.created_at ?? '1970-01-01T00:00:00Z')
      .order('finished_at', { ascending: false });
    const actAttempt = actAttempts?.find(a => satisfiesActAssignmentScope(a.sections, a.format, assignment.filter_criteria?.sections));
    if (actAttempt?.id) actResultsHref = `/practice/test/act/attempt/${actAttempt.id}/results`;
  }

  const teacherName = assignment.teacher
    ? [assignment.teacher.first_name, assignment.teacher.last_name].filter(Boolean).join(' ')
    : null;
  const title = displayTitle(assignment);
  const isOverdue =
    assignment.due_date &&
    enrolled.completed_at == null &&
    isPastDueDate(assignment.due_date);

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
        {(assignment.assignment_type === 'questions'
          || assignment.assignment_type === 'lesson_pack') && (
          <QuestionsView
            assignment={assignment}
            rows={questionRows ?? []}
            completed={enrolled.completed_at != null}
            latestSessionId={latestSession?.id ?? null}
            testType={assignment.test_type === 'act' ? 'act' : 'sat'}
          />
        )}
        {assignment.assignment_type === 'practice_test' && (
          <PracticeTestView assignment={assignment} actResultsHref={actResultsHref} defaultTimeMultiplier={defaultTimeMultiplier} />
        )}
        {assignment.assignment_type === 'lesson' && (
          <LessonView assignment={assignment} />
        )}
      </section>
    </main>
  );
}

function QuestionsView({ assignment, rows, completed, latestSessionId, testType = 'sat' }) {
  if (rows.length === 0) {
    return <p style={{ color: '#6b7280' }}>This assignment has no questions.</p>;
  }

  const doneCount = rows.filter((r) => r.is_done).length;
  const correctCount = rows.filter((r) => r.is_done && r.is_correct).length;
  const total = rows.length;

  // Once the assignment has been submitted at least once, the
  // primary CTA flips to "View report" and "Redo" sits next to
  // it. Before then, "Start" / "Continue (N left)" are the only
  // affordances. The Start action is never disabled — re-doing
  // is allowed, and submitPracticeSession will refresh the
  // completion timestamp on each submit.
  const startLabel =
    completed
      ? 'Redo'
      : doneCount > 0
        ? `Continue (${total - doneCount} left)`
        : 'Start';

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
        {completed && latestSessionId && (
          <Button href={`/practice/review/${latestSessionId}`}>
            View report
          </Button>
        )}
        <StartAssignmentButton
          assignmentId={assignment.id}
          label={startLabel}
          disabled={false}
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
                background: difficultyColor(r.difficulty, testType), color: 'white',
              }}>
                {difficultyLabel(r.difficulty, testType)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function PracticeTestView({ assignment, actResultsHref = null, defaultTimeMultiplier = 1 }) {
  // ACT (Phase 4B): the form runs through the ACT test mode — one
  // attempt per form, sections timed one at a time with the format's
  // official limits. Start creates the attempt; results link to the
  // latest completed attempt of the form since the assignment.
  if (assignment.test_type === 'act') {
    return (
      <section style={{
        padding: '1.5rem', border: '1px solid #e5e7eb', borderRadius: 8,
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
          {assignment.title ?? (assignment.act_source_test ? defaultActFormName(assignment.act_source_test) : 'ACT practice test')}
        </h2>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          ACT practice test · {actAssignmentScopeLabel(assignment.filter_criteria?.sections)} · official time limits.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {actResultsHref && (
            <Button href={actResultsHref}>View results</Button>
          )}
          <StartAssignmentButton
            assignmentId={assignment.id}
            label={actResultsHref ? 'Take it again' : 'Start practice test'}
            disabled={false}
            defaultTimeMultiplier={defaultTimeMultiplier}
            startAction={startAssignmentActTest}
          />
        </div>
      </section>
    );
  }

  const pt = assignment.practice_test;
  const sections = assignment.filter_criteria?.sections;
  // Propagate the assignment's section preference to the launch
  // page as ?sections=rw|math. The picker on the launch screen
  // pre-fills from this but allows the student to override.
  const launchHref = sections && sections !== 'both'
    ? `/practice/test/${assignment.practice_test_id}?sections=${sections}`
    : `/practice/test/${assignment.practice_test_id}`;

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
        href={launchHref}
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
          href={`/learn/${assignment.lesson_id}`}
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
  if (a.assignment_type === 'practice_test') {
    return a.practice_test?.name
      ?? (a.act_source_test ? defaultActFormName(a.act_source_test) : 'Practice Test');
  }
  return 'Assignment';
}

// SAT difficulty is 1–3; ACT is 1–5 (1–2 easy, 3 medium, 4–5 hard).
function difficultyLabel(d, testType = 'sat') {
  if (testType === 'act') return Number.isInteger(d) ? `Level ${d}` : '?';
  return { 1: 'Easy', 2: 'Medium', 3: 'Hard' }[d] ?? '?';
}

function difficultyColor(d, testType = 'sat') {
  if (testType === 'act') {
    if (d <= 2) return '#10b981';
    if (d === 3) return '#f59e0b';
    return '#ef4444';
  }
  return { 1: '#10b981', 2: '#f59e0b', 3: '#ef4444' }[d] ?? '#9ca3af';
}
