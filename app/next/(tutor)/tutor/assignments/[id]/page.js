// Tutor → assignment detail. Shows the assignment's metadata,
// the list of enrolled students, and each student's progress
// (attempts done, accuracy, completion state).
//
// Same design-kit vocabulary as the rest of the new tree:
// breadcrumb + eyebrow + serif H1, stats strip, content card.
// Per-student progress is computed from the v2 attempts table
// (latest attempt per question wins) — we do not read v1
// question_status here, since the new submit path doesn't
// maintain it.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { expandToAttemptIds } from '@/lib/practice/weak-queue';
import { AssignmentTypeBadge } from '@/lib/ui/AssignmentTypeBadge';
import { formatDate } from '@/lib/formatters';
import { addAssignmentMembers, submitAssignmentOnBehalf } from './actions';
import { AddMembersPicker } from './AddMembersPicker';
import { SubmitOnBehalfButton } from './SubmitOnBehalfButton';
import s from './AssignmentDetail.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentDetailPage({ params }) {
  const { id: assignmentId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const [{ data: assignment }, { data: junctionRows }] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select(`
        id, assignment_type, title, description, due_date, archived_at, deleted_at,
        created_at, question_ids, filter_criteria, lesson_id, practice_test_id,
        teacher:profiles!assignments_v2_teacher_id_fkey (id, first_name, last_name),
        lesson:lessons (id, title),
        practice_test:practice_tests_v2 (id, code, name)
      `)
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select(`
        student_id, completed_at, created_at,
        student:profiles!assignment_students_v2_student_id_fkey (id, first_name, last_name, email)
      `)
      .eq('assignment_id', assignmentId),
  ]);

  if (!assignment || assignment.deleted_at) notFound();

  // For 'questions' assignments, compute per-student progress from
  // the v2 attempts table directly (not question_status, which the
  // new tree doesn't maintain). Latest attempt per (user, question)
  // wins for the correctness flag — matches the runner's review
  // behavior. Also feed the cohort-wide accuracy stat at the top.
  const questionIds =
    assignment.assignment_type === 'questions' && Array.isArray(assignment.question_ids)
      ? assignment.question_ids
      : [];
  const studentIds = (junctionRows ?? []).map((r) => r.student_id);

  // Expand the v2 question_ids to also cover legacy v1 ids so
  // students' pre-cutover attempts on these questions count toward
  // the cohort stats below.
  const { allIds: attemptQuestionIds, v2ByLegacy } = await expandToAttemptIds(
    supabase,
    questionIds,
  );

  // Two parallel reads: per-student attempts (latest wins for the
  // correctness flag) and the question metadata so the Questions
  // section below can show display_code + skill + per-question
  // cohort accuracy. Skipped when the assignment has no question
  // pool (lesson / practice-test types).
  const [attemptRowsRes, questionMetaRes, sessionRowsRes] = await Promise.all([
    attemptQuestionIds.length > 0 && studentIds.length > 0
      ? supabase
          .from('attempts')
          .select('user_id, question_id, is_correct, created_at')
          .in('user_id', studentIds)
          .in('question_id', attemptQuestionIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    questionIds.length > 0
      ? supabase
          .from('questions_v2')
          .select('id, display_code, domain_name, skill_name, difficulty')
          .in('id', questionIds)
      : Promise.resolve({ data: [] }),
    // Latest practice session per student for this assignment.
    // Powers the per-row "Report" link: when a student has at
    // least one session that was launched from this assignment,
    // the row gets a direct link to the latest one's review.
    studentIds.length > 0
      ? supabase
          .from('practice_sessions')
          .select('id, user_id, status, created_at')
          .in('user_id', studentIds)
          .eq('filter_criteria->>assignment_id', assignmentId)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const attemptRows = attemptRowsRes.data ?? [];
  const questionMeta = new Map(
    (questionMetaRes.data ?? []).map((q) => [q.id, q]),
  );
  // First (= most recent) session per user. Prefer a completed
  // one if any exist; otherwise fall back to the most recent
  // in-progress so the tutor can at least see in-flight work.
  const reportSessionByUser = new Map();
  for (const r of sessionRowsRes.data ?? []) {
    const existing = reportSessionByUser.get(r.user_id);
    if (!existing) {
      reportSessionByUser.set(r.user_id, r);
    } else if (existing.status !== 'completed' && r.status === 'completed') {
      reportSessionByUser.set(r.user_id, r);
    }
  }

  const statusByStudent = new Map();
  const statusByQuestion = new Map();  // qid (v2) → { done, correct }
  const seenPairs = new Set();
  let cohortDone = 0;
  let cohortCorrect = 0;
  for (const r of attemptRows) {
    // Normalize legacy attempt ids back to the v2 question they
    // map to, so seenPairs / statusByQuestion are keyed
    // consistently regardless of which era the attempt landed in.
    const qKey = v2ByLegacy.get(r.question_id) ?? r.question_id;
    const key = `${r.user_id}::${qKey}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const t = statusByStudent.get(r.user_id) ?? { done: 0, correct: 0 };
    t.done += 1;
    if (r.is_correct) t.correct += 1;
    statusByStudent.set(r.user_id, t);
    const q = statusByQuestion.get(qKey) ?? { done: 0, correct: 0 };
    q.done += 1;
    if (r.is_correct) q.correct += 1;
    statusByQuestion.set(qKey, q);
    cohortDone += 1;
    if (r.is_correct) cohortCorrect += 1;
  }

  const students = (junctionRows ?? []).map((r) => {
    const stats = statusByStudent.get(r.student_id) ?? { done: 0, correct: 0 };
    const name =
      [r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ')
      || r.student?.email || 'Student';
    const reportSession = reportSessionByUser.get(r.student_id) ?? null;
    return {
      id: r.student_id,
      name,
      email: r.student?.email ?? null,
      completed_at: r.completed_at,
      done: stats.done,
      correct: stats.correct,
      reportSessionId:
        reportSession && reportSession.status === 'completed'
          ? reportSession.id
          : null,
    };
  });
  students.sort((a, b) => a.name.localeCompare(b.name));

  // Eligible-to-add pool for the AddMembersPicker. Pulls every
  // student the caller can see (RLS on student_practice_stats
  // already scopes this) plus the manager's teachers if the
  // caller is a manager / admin. Anyone already enrolled is
  // filtered out so the picker shows only people who can
  // actually be added. The action does its own role check + RLS
  // gate on insert; this list just drives the UI.
  const enrolledIds = new Set((junctionRows ?? []).map((r) => r.student_id));
  const isManagerScope = profile.role === 'manager' || profile.role === 'admin';

  const [{ data: eligibleStudents }, { data: teacherJuncs }] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('user_id, first_name, last_name, email')
      .order('last_name', { ascending: true, nullsFirst: false }),
    isManagerScope
      ? supabase
          .from('manager_teacher_assignments')
          .select('teacher_id')
          .eq('manager_id', user.id)
      : Promise.resolve({ data: [] }),
  ]);

  let eligibleTeachers = [];
  const teacherIds = (teacherJuncs ?? []).map((r) => r.teacher_id).filter(Boolean);
  if (teacherIds.length > 0) {
    const { data: teacherRows } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', teacherIds);
    eligibleTeachers = (teacherRows ?? []).map((t) => ({
      id: t.id,
      role: 'trainee',
      name:
        [t.first_name, t.last_name].filter(Boolean).join(' ')
        || t.email || 'Teacher',
      email: t.email,
    }));
  }

  const eligible = [
    ...(eligibleStudents ?? []).map((row) => ({
      id: row.user_id,
      role: 'student',
      name:
        [row.first_name, row.last_name].filter(Boolean).join(' ')
        || row.email || 'Student',
      email: row.email,
    })),
    ...eligibleTeachers,
  ]
    .filter((p) => p.id && !enrolledIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const title = assignment.title
    ?? (assignment.assignment_type === 'lesson' ? assignment.lesson?.title : null)
    ?? (assignment.assignment_type === 'practice_test' ? assignment.practice_test?.name : null)
    ?? 'Assignment';

  const totalQuestions = questionIds.length;
  const completedCount = students.filter((s) => s.completed_at).length;
  const cohortAccuracyPct =
    cohortDone > 0 ? Math.round((cohortCorrect / cohortDone) * 100) : null;
  const completionPct =
    students.length > 0
      ? Math.round((completedCount / students.length) * 100)
      : null;
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const isOverdue =
    assignment.due_date && Date.parse(assignment.due_date) < nowMs;

  return (
    <main className={s.container}>
      <Link href="/tutor/assignments" className={s.breadcrumb}>
        ← Your assignments
      </Link>

      <header className={s.header}>
        <div className={s.eyebrow}>Assignment</div>
        <h1 className={s.h1}>{title}</h1>
        <div className={s.metaRow}>
          <AssignmentTypeBadge type={assignment.assignment_type} />
          {assignment.due_date && (
            <span className={isOverdue ? s.metaOverdue : s.metaItem}>
              {isOverdue ? 'Overdue' : 'Due'} · {formatDate(assignment.due_date)}
            </span>
          )}
          {assignment.archived_at && (
            <span className={s.metaArchived}>Archived</span>
          )}
        </div>
        {assignment.description && (
          <p className={s.description}>{assignment.description}</p>
        )}
      </header>

      <div className={s.statsStrip}>
        <StatTile label="Students" value={students.length} />
        <StatTile
          label="Completed"
          value={`${completedCount} / ${students.length}`}
          sub={completionPct == null ? 'No students assigned' : `${completionPct}%`}
          tone="good"
        />
        {assignment.assignment_type === 'questions' && (
          <StatTile
            label="Questions"
            value={totalQuestions}
            sub={
              cohortDone > 0
                ? `${cohortDone.toLocaleString()} attempts across cohort`
                : 'No attempts yet'
            }
          />
        )}
        {assignment.assignment_type === 'questions' && cohortAccuracyPct != null && (
          <StatTile
            label="Cohort accuracy"
            value={`${cohortAccuracyPct}%`}
            sub={`${cohortCorrect.toLocaleString()} correct / ${cohortDone.toLocaleString()}`}
            tone={accTone(cohortAccuracyPct)}
          />
        )}
      </div>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Enrolled students</div>
            <div className={s.cardHint}>
              {students.length === 0
                ? 'No students assigned yet.'
                : `Click a row for the per-student detail view.`}
            </div>
          </div>
        </div>

        {!assignment.archived_at && (
          <AddMembersPicker
            assignmentId={assignment.id}
            eligible={eligible}
            addAction={addAssignmentMembers}
          />
        )}

        {students.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No students.</div>
            <div className={s.emptyBody}>
              This assignment has no students enrolled.
            </div>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>Student</th>
                  {assignment.assignment_type === 'questions' && (
                    <>
                      <th className={s.thNum}>Done</th>
                      <th className={s.thProgress}>Progress</th>
                      <th className={s.thNum}>Accuracy</th>
                    </>
                  )}
                  <th className={s.th}>Completed</th>
                  {assignment.assignment_type === 'questions' && (
                    <th className={s.th}>Report</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {students.map((stu) => {
                  const donePct =
                    totalQuestions > 0
                      ? Math.round((stu.done / totalQuestions) * 100)
                      : null;
                  const accPct =
                    stu.done > 0
                      ? Math.round((stu.correct / stu.done) * 100)
                      : null;
                  return (
                    <tr key={stu.id} className={s.row}>
                      <td className={s.td}>
                        <Link
                          href={`/tutor/students/${stu.id}`}
                          className={s.nameLink}
                        >
                          {stu.name}
                        </Link>
                        {stu.email && <div className={s.email}>{stu.email}</div>}
                      </td>
                      {assignment.assignment_type === 'questions' && (
                        <>
                          <td className={s.tdNum}>
                            {stu.done}
                            <span className={s.muted}> / {totalQuestions}</span>
                          </td>
                          <td className={s.tdProgress}>
                            {totalQuestions > 0 && (
                              <div className={s.progress}>
                                <div
                                  className={s.progressBar}
                                  style={{ width: `${donePct ?? 0}%` }}
                                />
                              </div>
                            )}
                          </td>
                          <td className={s.tdNum}>
                            {accPct == null ? (
                              <span className={s.muted}>—</span>
                            ) : (
                              <span className={`${s.accBadge} ${accBadgeTone(accPct, s)}`}>
                                {accPct}%
                              </span>
                            )}
                          </td>
                        </>
                      )}
                      <td className={s.td}>
                        {stu.completed_at ? (
                          <span className={s.completedTag}>
                            ✓ {formatDate(stu.completed_at)}
                          </span>
                        ) : (
                          <span className={s.muted}>—</span>
                        )}
                      </td>
                      {assignment.assignment_type === 'questions' && (
                        <td className={s.td}>
                          {stu.reportSessionId ? (
                            <Link
                              href={`/tutor/sessions/${stu.reportSessionId}`}
                              className={s.reportLink}
                            >
                              View report →
                            </Link>
                          ) : !assignment.archived_at ? (
                            <SubmitOnBehalfButton
                              assignmentId={assignment.id}
                              studentId={stu.id}
                              studentName={stu.name}
                              done={stu.done}
                              total={totalQuestions}
                              action={submitAssignmentOnBehalf}
                            />
                          ) : (
                            <span className={s.muted}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assignment.assignment_type === 'questions' && questionIds.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div>
              <div className={s.h2}>Questions</div>
              <div className={s.cardHint}>
                {students.length === 1
                  ? "What's been assigned and how this student has done so far."
                  : "What's been assigned and the cohort's accuracy on each question."}
              </div>
            </div>
            <span className={s.cardTag}>{questionIds.length} total</span>
          </div>
          <ul className={s.questionList}>
            {questionIds.map((qid, i) => {
              const meta = questionMeta.get(qid) ?? null;
              const stat = statusByQuestion.get(qid) ?? { done: 0, correct: 0 };
              const isSingleStudent = students.length === 1;
              const studentTotal = students.length;
              const accuracyPct =
                stat.done > 0 ? Math.round((stat.correct / stat.done) * 100) : null;

              let statusText;
              let statusClass;
              if (isSingleStudent) {
                if (stat.done === 0) {
                  statusText = 'Unanswered';
                  statusClass = s.qStatusPending;
                } else if (stat.correct > 0) {
                  statusText = 'Correct';
                  statusClass = s.qStatusCorrect;
                } else {
                  statusText = 'Wrong';
                  statusClass = s.qStatusWrong;
                }
              } else {
                statusText =
                  stat.done === 0
                    ? `0 of ${studentTotal} attempted`
                    : `${stat.correct} of ${stat.done} correct${
                        accuracyPct != null ? ` · ${accuracyPct}%` : ''
                      }`;
                statusClass =
                  accuracyPct == null
                    ? s.qStatusPending
                    : accuracyPct >= 80
                      ? s.qStatusCorrect
                      : accuracyPct >= 50
                        ? s.qStatusOk
                        : s.qStatusWrong;
              }

              return (
                <li key={qid} className={s.qRow}>
                  <span className={s.qIndex}>{i + 1}</span>
                  <div className={s.qInfo}>
                    <div className={s.qCode}>
                      {meta?.display_code ?? qid.slice(0, 8)}
                    </div>
                    <div className={s.qMeta}>
                      {meta?.domain_name && (
                        <span>{meta.domain_name}</span>
                      )}
                      {meta?.skill_name && (
                        <>
                          {meta.domain_name && <span className={s.muted}> · </span>}
                          <span>{meta.skill_name}</span>
                        </>
                      )}
                      {meta?.difficulty != null && (
                        <>
                          <span className={s.muted}> · </span>
                          <span>diff {meta.difficulty}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span className={`${s.qStatus} ${statusClass}`}>
                    {statusText}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className={`${s.statTile} ${s[`statTile_${tone}`] ?? ''}`}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

function accTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'warn';
}

function accBadgeTone(pct, styles) {
  if (pct >= 80) return styles.accGood;
  if (pct >= 50) return styles.accOk;
  return styles.accBad;
}
