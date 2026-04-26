// Manager → per-teacher detail. Shows the teacher's profile,
// their roster (with the same RosterFinder used on the tutor
// dashboard, scoped to this teacher's students), and their
// recent assignments.
//
// Role gated to manager + admin via the tutor layout. RLS via
// can_view does the heavy lifting — managers can read their
// teachers' rows but not other managers'.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatRelativeShort } from '@/lib/formatters';
import { AssignmentTypeBadge } from '@/lib/ui/AssignmentTypeBadge';
import { RosterFinder } from '../../dashboard/RosterFinder';
import s from './TeacherDetail.module.css';

export const dynamic = 'force-dynamic';

const RECENT_ASSIGNMENTS_LIMIT = 12;

export default async function ManagerTeacherDetailPage({ params }) {
  const { teacherId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (profile.role === 'teacher') redirect('/tutor/dashboard');
  if (!['manager', 'admin'].includes(profile.role)) redirect('/');

  // Confirm this teacher is on the caller's team. Admins skip
  // the check (they can view everyone). Otherwise, an unmatched
  // pair returns 404.
  if (profile.role === 'manager') {
    const { data: link } = await supabase
      .from('manager_teacher_assignments')
      .select('teacher_id')
      .eq('manager_id', user.id)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    if (!link) notFound();
  }

  // Parallel: teacher profile, their student junctions, their
  // recent assignments, plus the teacher's own training data
  // (assignments aimed AT them as a trainee, recent training
  // sessions, recent test attempts) — that's the manager-side
  // mirror of the per-student detail and gives meeting prep at
  // a glance.
  const [
    { data: teacher },
    { data: tsRows },
    { data: assignments },
    { data: trainingAssignmentJunctions },
    { data: trainingSessions },
    { data: trainingTests },
  ] = await Promise.all([
    // profile_cards doesn't expose email; the page needs it for
    // the teacher header. profiles_select via can_view(id) covers
    // the manager → teacher direct path that brings us here.
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .eq('id', teacherId)
      .maybeSingle(),
    supabase
      .from('teacher_student_assignments')
      .select('student_id, created_at')
      .eq('teacher_id', teacherId),
    supabase
      .from('assignments_v2')
      .select(`
        id, assignment_type, title, due_date, archived_at,
        deleted_at, created_at, question_ids,
        lesson:lessons (title),
        practice_test:practice_tests_v2 (name)
      `)
      .eq('teacher_id', teacherId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_ASSIGNMENTS_LIMIT),
    // Training assignments: ones where the teacher is the trainee.
    // Embed the parent so we can render type + title inline.
    supabase
      .from('assignment_students_v2')
      .select(`
        completed_at, created_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, archived_at, deleted_at,
          question_ids,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', teacherId)
      .order('created_at', { ascending: false })
      .limit(RECENT_ASSIGNMENTS_LIMIT),
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, mode, status')
      .eq('user_id', teacherId)
      .in('mode', ['training', 'review'])
      .neq('status', 'abandoned')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, status, started_at, finished_at,
        composite_score, rw_scaled, math_scaled,
        practice_test:practice_tests_v2 (name, code)
      `)
      .eq('user_id', teacherId)
      .order('started_at', { ascending: false })
      .limit(6),
  ]);

  if (!teacher) notFound();

  const studentIds = (tsRows ?? []).map((r) => r.student_id);

  // Roster stats for the RosterFinder. Same view the tutor
  // dashboard reads, plus a junction-row count for the assignment
  // completion rate at the top.
  const [
    { data: studentRows },
    { data: assignmentJunctions },
  ] = studentIds.length > 0
    ? await Promise.all([
        supabase
          .from('student_practice_stats')
          .select('user_id, first_name, last_name, email, target_sat_score, high_school, graduation_year, total_attempts, correct_attempts, week_attempts, last_activity_at')
          .in('user_id', studentIds),
        (assignments ?? []).length > 0
          ? supabase
              .from('assignment_students_v2')
              .select('assignment_id, completed_at')
              .in('assignment_id', (assignments ?? []).map((a) => a.id))
          : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];

  const teacherName =
    [teacher.first_name, teacher.last_name].filter(Boolean).join(' ')
    || teacher.email
    || 'Teacher';

  // Reuse the dashboard's roster shape so RosterFinder works
  // unchanged.
  const students = (studentRows ?? []).map((row) => {
    const total = Number(row.total_attempts ?? 0);
    const correct = Number(row.correct_attempts ?? 0);
    return {
      id: row.user_id,
      name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || '—',
      email: row.email,
      targetScore: row.target_sat_score,
      highSchool: row.high_school,
      graduationYear: row.graduation_year,
      totalAttempts: total,
      weekAttempts: Number(row.week_attempts ?? 0),
      accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
      lastActivityAt: row.last_activity_at,
    };
  }).sort((a, b) => {
    if (!a.lastActivityAt && !b.lastActivityAt) return a.name.localeCompare(b.name);
    if (!a.lastActivityAt) return 1;
    if (!b.lastActivityAt) return -1;
    return b.lastActivityAt.localeCompare(a.lastActivityAt);
  });

  // Per-teacher cohort stats.
  const totalAttempts = students.reduce((acc, st) => acc + st.totalAttempts, 0);
  const totalCorrect = students.reduce(
    (acc, st) => acc + Math.round((st.accuracy ?? 0) / 100 * st.totalAttempts),
    0,
  );
  const teamAccuracy =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;
  const weekAttempts = students.reduce((acc, st) => acc + st.weekAttempts, 0);
  const activeThisWeek = students.filter((st) => st.weekAttempts > 0).length;

  // Assignment completion rate over their pulled set.
  const assignmentIds = (assignments ?? []).map((a) => a.id);
  const completionsByAssignment = new Map();
  for (const r of assignmentJunctions ?? []) {
    if (!assignmentIds.includes(r.assignment_id)) continue;
    const t = completionsByAssignment.get(r.assignment_id) ?? { total: 0, completed: 0 };
    t.total += 1;
    if (r.completed_at) t.completed += 1;
    completionsByAssignment.set(r.assignment_id, t);
  }

  // Training rollups for the manager-side Training panel.
  const trainingAssignments = (trainingAssignmentJunctions ?? [])
    .map((r) => ({
      ...r.assignment,
      student_completed_at: r.completed_at,
      junction_created_at: r.created_at,
    }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at);

  const trainingCompletedTests = (trainingTests ?? []).filter((t) => t.status === 'completed');
  const trainingTestsTaken = trainingCompletedTests.length;
  const latestComposite = trainingCompletedTests
    .filter((t) => Number.isFinite(t.composite_score))
    .map((t) => t.composite_score)[0] ?? null;

  const trainingSessionRows = (trainingSessions ?? [])
    .filter((row) => Array.isArray(row.question_ids) && row.question_ids.length > 0)
    .map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      total: row.question_ids.length,
      completed: row.status === 'completed',
    }));

  return (
    <main className={s.container}>
      <Link href="/tutor/teachers" className={s.breadcrumb}>
        ← All teachers
      </Link>

      <header className={s.header}>
        <div className={s.eyebrow}>Manager · Teacher</div>
        <h1 className={s.h1}>{teacherName}</h1>
        {teacher.email && <div className={s.sub}>{teacher.email}</div>}
      </header>

      <div className={s.statsStrip}>
        <StatTile label="Students" value={students.length} />
        <StatTile
          label="Active this week"
          value={activeThisWeek}
          sub={
            students.length === 0
              ? '—'
              : `${Math.round((activeThisWeek / students.length) * 100)}% of roster`
          }
          tone={activeThisWeek > 0 ? 'good' : 'neutral'}
        />
        <StatTile label="Attempts · 7d" value={weekAttempts.toLocaleString()} />
        <StatTile
          label="Cohort accuracy"
          value={teamAccuracy == null ? '—' : `${teamAccuracy}%`}
          sub={
            totalAttempts === 0
              ? 'No attempts yet'
              : `${totalAttempts.toLocaleString()} attempts total`
          }
          tone={accuracyTone(teamAccuracy)}
        />
      </div>

      {students.length > 0 && <RosterFinder students={students} />}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Recent assignments</div>
            <div className={s.cardHint}>
              Last {RECENT_ASSIGNMENTS_LIMIT} this teacher has sent —
              click for the per-assignment detail.
            </div>
          </div>
        </div>
        {(assignments ?? []).length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No assignments yet.</div>
            <div className={s.emptyBody}>
              Once {teacherName} sends an assignment it&apos;ll show up
              here with completion progress.
            </div>
          </div>
        ) : (
          <ul className={s.assignmentList}>
            {(assignments ?? []).map((a) => {
              const stats = completionsByAssignment.get(a.id) ?? { total: 0, completed: 0 };
              const completionPct =
                stats.total > 0
                  ? Math.round((stats.completed / stats.total) * 100)
                  : null;
              const title = a.title
                ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
                ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
                ?? 'Assignment';
              return (
                <li key={a.id}>
                  <Link href={`/tutor/assignments/${a.id}`} className={s.assignRow}>
                    <AssignmentTypeBadge type={a.assignment_type} />
                    <div className={s.assignMain}>
                      <div className={s.assignTitle}>{title}</div>
                      <div className={s.assignMeta}>
                        {stats.total === 0
                          ? 'No students'
                          : `${stats.completed} of ${stats.total} completed${
                              completionPct != null ? ` · ${completionPct}%` : ''
                            }`}
                        <span className={s.muted}> · </span>
                        {formatRelativeShort(a.created_at) ?? 'Just now'}
                        {a.archived_at && (
                          <>
                            <span className={s.muted}> · </span>
                            <span className={s.archived}>Archived</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={s.assignChevron} aria-hidden="true">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Training</div>
            <div className={s.cardHint}>
              {teacherName}&apos;s own SAT practice and review — what
              they&apos;ve done as a trainee. Helps the
              meeting-prep flow when you want to discuss the
              homework or test you assigned them.
            </div>
          </div>
          <span className={s.cardTag}>
            {trainingTestsTaken} tests · {trainingSessionRows.length} sessions
          </span>
        </div>

        <div className={s.trainingGrid}>
          <div className={s.trainingCol}>
            <div className={s.trainingHeader}>Training assignments</div>
            {trainingAssignments.length === 0 ? (
              <div className={s.trainingEmpty}>
                No training assignments sent yet. Use the New
                assignment form&apos;s Trainees toggle to give
                them homework.
              </div>
            ) : (
              <ul className={s.trainingList}>
                {trainingAssignments.map((a) => {
                  const title = a.title
                    ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
                    ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
                    ?? 'Training assignment';
                  return (
                    <li key={a.id}>
                      <Link
                        href={`/tutor/assignments/${a.id}`}
                        className={s.trainingRow}
                      >
                        <AssignmentTypeBadge type={a.assignment_type} />
                        <div className={s.trainingRowMain}>
                          <div className={s.trainingRowTitle}>{title}</div>
                          <div className={s.trainingRowMeta}>
                            {a.student_completed_at
                              ? `Completed ${formatRelativeShort(a.student_completed_at) ?? ''}`
                              : `Assigned ${formatRelativeShort(a.junction_created_at) ?? ''}`}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className={s.trainingCol}>
            <div className={s.trainingHeader}>Practice tests</div>
            {(trainingTests ?? []).length === 0 ? (
              <div className={s.trainingEmpty}>
                No practice tests taken yet.
                {latestComposite != null && ` Latest composite: ${latestComposite}.`}
              </div>
            ) : (
              <ul className={s.trainingList}>
                {(trainingTests ?? []).map((t) => (
                  <li key={t.id}>
                    <Link
                      href={
                        t.status === 'completed'
                          ? `/practice/test/attempt/${t.id}/results`
                          : `/tutor/teachers/${teacherId}`
                      }
                      className={s.trainingRow}
                    >
                      <div className={s.trainingRowMain}>
                        <div className={s.trainingRowTitle}>
                          {t.practice_test?.name ?? 'Practice test'}
                        </div>
                        <div className={s.trainingRowMeta}>
                          {t.practice_test?.code ?? ''}
                          {t.practice_test?.code && ' · '}
                          {formatRelativeShort(t.finished_at ?? t.started_at) ?? '—'}
                          {t.status !== 'completed' && (
                            <> · {t.status === 'in_progress' ? 'In progress' : 'Abandoned'}</>
                          )}
                        </div>
                      </div>
                      {t.status === 'completed' && t.composite_score != null && (
                        <span className={s.trainingScore}>
                          {t.composite_score}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={s.trainingCol}>
            <div className={s.trainingHeader}>Practice sessions</div>
            {trainingSessionRows.length === 0 ? (
              <div className={s.trainingEmpty}>
                No training sessions yet.
              </div>
            ) : (
              <ul className={s.trainingList}>
                {trainingSessionRows.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={
                        row.completed
                          ? `/practice/review/${row.id}`
                          : `/tutor/teachers/${teacherId}`
                      }
                      className={s.trainingRow}
                    >
                      <div className={s.trainingRowMain}>
                        <div className={s.trainingRowTitle}>
                          {row.total} question{row.total === 1 ? '' : 's'}
                        </div>
                        <div className={s.trainingRowMeta}>
                          {formatRelativeShort(row.createdAt) ?? '—'}
                          {!row.completed && ' · In progress'}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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

function accuracyTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'warn';
}
