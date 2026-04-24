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
import { AssignmentTypeBadge } from '@/lib/ui/AssignmentTypeBadge';
import { formatDate } from '@/lib/formatters';
import s from './AssignmentDetail.module.css';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentDetailPage({ params }) {
  const { id: assignmentId } = await params;
  const { profile, supabase } = await requireUser();

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

  let attemptRows = [];
  if (questionIds.length > 0 && studentIds.length > 0) {
    const { data } = await supabase
      .from('attempts')
      .select('user_id, question_id, is_correct, created_at')
      .in('user_id', studentIds)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false });
    attemptRows = data ?? [];
  }

  const statusByStudent = new Map();
  const seenPairs = new Set();
  let cohortDone = 0;
  let cohortCorrect = 0;
  for (const r of attemptRows) {
    const key = `${r.user_id}::${r.question_id}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    const t = statusByStudent.get(r.user_id) ?? { done: 0, correct: 0 };
    t.done += 1;
    if (r.is_correct) t.correct += 1;
    statusByStudent.set(r.user_id, t);
    cohortDone += 1;
    if (r.is_correct) cohortCorrect += 1;
  }

  const students = (junctionRows ?? []).map((r) => {
    const stats = statusByStudent.get(r.student_id) ?? { done: 0, correct: 0 };
    const name =
      [r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ')
      || r.student?.email || 'Student';
    return {
      id: r.student_id,
      name,
      email: r.student?.email ?? null,
      completed_at: r.completed_at,
      done: stats.done,
      correct: stats.correct,
    };
  });
  students.sort((a, b) => a.name.localeCompare(b.name));

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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
