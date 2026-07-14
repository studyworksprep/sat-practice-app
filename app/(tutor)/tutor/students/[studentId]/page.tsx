// Tutor → individual student detail page. See
// docs/architecture-plan.md §3.8.
//
// Shows the student's profile + cohort-style stat row, then their
// assignments, practice tests, and practice sessions in that
// order — what a tutor wants to scan before a meeting. RLS on
// every table uses can_view(), so the page returns 404 if the
// caller can't see this student.
//
// Read-only on the tutor side — mutations live elsewhere
// (assignments/new for new work; the runner pages for the
// student themselves). The single Server Action used here is
// importStudentPracticeHistory, kept on the existing
// ImportPracticeHistoryButton client island.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatDate, formatRelativeShort, isPastDueDate } from '@/lib/formatters';
import { loadDashboardAggregate } from '@/lib/practice/load-dashboard-aggregate';
import { loadDashboardAggregateAct } from '@/lib/practice/load-dashboard-aggregate-act';
import { SkillBreakdownCard } from '@/lib/practice/SkillBreakdownCard';
import { buildArchiveSummary } from '@/lib/practice/superscore';
import {
  InboxIcon,
  PencilIcon,
  PerformanceIcon,
  TestIcon,
} from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { DeletePracticeTestButton } from './DeletePracticeTestButton';
import { EditTargetStartButton } from './EditTargetStartModal';
import { OfficialScoresCard } from './OfficialScoresCard';
import { ScoreProgressChart } from './ScoreProgressChart';
import { TestRegistrationsCard } from './TestRegistrationsCard';
import { UploadBluebookCard } from './UploadBluebookCard';
import s from './StudentDetail.module.css';

import type { ViewRow, SubjectCode } from '@/lib/types';

export const dynamic = 'force-dynamic';

const RECENT_SESSIONS_LIMIT = 10;
const RECENT_TESTS_LIMIT    = 10;

interface PageProps {
  params: Promise<{ studentId: string }>;
}

export default async function TutorStudentDetailPage({ params }: PageProps) {
  const { studentId } = await params;
  const { profile, supabase } = await requireUser();

  // Role gate. The (tutor) layout already enforces this; the
  // belt-and-suspenders guard here keeps direct-URL hits safe if
  // the layout is ever bypassed.
  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // Parallel reads. RLS uses can_view() on each table, so an
  // empty result on the stats row means the caller can't see this
  // student → 404. The dashboard aggregate runs as the same RLS-
  // scoped client, so the tutor only sees their student's data.
  const [
    { data: studentRows, error: rpcErr },
    { data: profileRow },
    { data: assignmentJunctions },
    { data: testAttemptRows },
    { data: completedTestRowsForScore },
    { data: sessionRows },
    { data: registrations },
    { data: officialScores },
    { data: publishedTests },
    aggregate,
    aggregateAct,
  ] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('*')
      .eq('user_id', studentId),
    supabase
      .from('profiles')
      .select('created_at, start_date')
      .eq('id', studentId)
      .maybeSingle(),
    // Assignments inbox for this student. Includes both SAT and
    // ACT — the parent assignment row carries its own test_type so
    // each tile can show an ACT/SAT badge. Was SAT-only until ACT
    // sessions started landing for students without their tutors
    // seeing them.
    supabase
      .from('assignment_students_v2')
      .select(`
        completed_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, archived_at, deleted_at, created_at,
          question_ids, test_type,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', studentId)
      .in('test_type', ['sat', 'act']),
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, status, started_at, finished_at,
        composite_score, rw_scaled, math_scaled, sections_only,
        practice_test:practice_tests_v2(name, code)
      `)
      .eq('user_id', studentId)
      .order('started_at', { ascending: false })
      .limit(RECENT_TESTS_LIMIT),
    // Every completed practice test, no limit. Feeds the
    // starting / final score math (buildArchiveSummary) — the
    // recent-tests query above caps at 10 for the display list,
    // which would under-count the "highest practice composite
    // overall" fallback and miss the practice test closest to
    // start_date for older students.
    supabase
      .from('practice_test_attempts_v2')
      .select('started_at, finished_at, composite_score, rw_scaled, math_scaled')
      .eq('user_id', studentId)
      .eq('status', 'completed'),
    // Self-guided sessions for this student, SAT + ACT. Includes
    // review-mode Weak Questions Drills — a drill is just a practice
    // session built from the weak-questions scheme, so it surfaces
    // here like any other. The row carries test_type so the list can
    // badge ACT sessions.
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, current_position, status, test_type')
      .eq('user_id', studentId)
      .in('mode', ['practice', 'review'])
      .in('test_type', ['sat', 'act'])
      .neq('status', 'abandoned')
      // Exclude assignment-linked sessions — those already surface
      // in the Assignments list above (each completed assignment
      // links to its session report there), so listing them here
      // would double-count the same work.
      .is('filter_criteria->>assignment_id', null)
      .order('created_at', { ascending: false })
      .limit(RECENT_SESSIONS_LIMIT),
    supabase
      .from('sat_test_registrations')
      .select('id, test_date, created_at')
      .eq('student_id', studentId)
      .order('test_date', { ascending: true }),
    supabase
      .from('sat_official_scores')
      .select(`
        id, test_date, rw_score, math_score, composite_score, created_at, test_type,
        domain_ini, domain_cas, domain_eoi, domain_sec,
        domain_alg, domain_atm, domain_pam, domain_geo
      `)
      .eq('student_id', studentId)
      .order('test_date', { ascending: false }),
    supabase
      .from('practice_tests_v2')
      .select('id, name, code')
      .eq('is_published', true)
      .is('deleted_at', null)
      .order('code', { ascending: true }),
    loadDashboardAggregate(studentId),
    loadDashboardAggregateAct(studentId),
  ]);

  if (rpcErr) {
    return <ErrorState message={`Failed to load student: ${rpcErr.message}`} />;
  }
  if (!studentRows || studentRows.length === 0) {
    notFound();
  }

  // The view returns numeric strings on aggregate columns —
  // narrow + coerce in one pass.
  const row = studentRows[0] as ViewRow<'student_practice_stats'>;
  const total   = Number(row.total_attempts ?? 0);
  const correct = Number(row.correct_attempts ?? 0);
  const week    = Number(row.week_attempts ?? 0);
  // Effective start date defaults to the signup timestamp
  // (profiles.created_at, set by handle_new_user) when start_date
  // hasn't been set explicitly. The Edit modal still writes to the
  // explicit start_date column; the fallback only governs display
  // and the archived-summary score lookups.
  const profileForStart = profileRow as { start_date?: string | null; created_at?: string | null } | null;
  const startDateRaw = profileForStart?.start_date ?? null;
  const effectiveStartDate = startDateRaw ?? profileForStart?.created_at ?? null;

  const student = {
    id: row.user_id ?? studentId,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Unknown',
    email: row.email,
    targetScore: row.target_sat_score,
    highSchool: row.high_school,
    graduationYear: row.graduation_year,
    satTestDate: row.sat_test_date,
    startDate: startDateRaw,
    effectiveStartDate,
    totalAttempts: total,
    correctAttempts: correct,
    weekAttempts: week,
    accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
    lastActivityAt: row.last_activity_at,
  };

  // Starting / final / impact / reach — same math the Roster's
  // past-students view uses, computed live so a tutor sees what
  // the summary would be without having to archive the student.
  // Helper is tolerant of empty inputs; rw_scaled / math_scaled
  // are passed through under the rw_score / math_score keys it
  // expects, matching the Roster page's mapping. Cast at the
  // boundary because superscore.js's destructure defaults read
  // as never[] from a strict TS caller.
  type CompletedTestRow = {
    started_at: string | null;
    finished_at: string | null;
    composite_score: number | null;
    rw_scaled: number | null;
    math_scaled: number | null;
  };
  const practiceTestsForScore = ((completedTestRowsForScore ?? []) as CompletedTestRow[]).map((r) => ({
    finished_at: r.finished_at,
    started_at: r.started_at,
    composite_score: r.composite_score,
    rw_score: r.rw_scaled,
    math_score: r.math_scaled,
  }));
  const scoreSummary: {
    startingScore: number | null;
    finalScore: number | null;
    impact: number | null;
    targetReachPct: number | null;
  } = buildArchiveSummary({
    officialScores: officialScores ?? [],
    practiceTests: practiceTestsForScore,
    startDate: student.effectiveStartDate,
    targetScore: student.targetScore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // Test attempts — keep status-aware, surface scores on completed
  // ones, link by status.
  const testRows = (testAttemptRows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    timestamp: r.finished_at ?? r.started_at,
    composite: r.composite_score,
    rwScaled: r.rw_scaled,
    mathScaled: r.math_scaled,
    sectionsOnly: r.sections_only ?? null,
    testName: (r.practice_test as { name?: string } | null)?.name ?? 'Practice test',
    testCode: (r.practice_test as { code?: string } | null)?.code ?? '',
  }));

  // Practice sessions — adjusted for tutor view: link to the
  // student's session report when completed, no Resume because
  // tutors don't take students' sessions for them.
  const sessionRowsView = (sessionRows ?? [])
    .filter((r) => Array.isArray(r.question_ids) && (r.question_ids as unknown[]).length > 0)
    .map((r) => {
      const totalQ = (r.question_ids as unknown[]).length;
      return {
        id: r.id,
        createdAt: r.created_at,
        total: totalQ,
        completed: r.status === 'completed',
        testType: (r.test_type ?? 'sat') as string,
      };
    });

  // Assignments: active first, archived dropped. PostgREST's
  // generated types model embedded one-to-one relations as arrays,
  // but the actual response is a single object — `as unknown as`
  // narrows past the over-broad generated type. (A long-term fix
  // is to switch the select to a non-embed shape.)
  type Assignment = {
    id: string;
    assignment_type: string;
    title: string | null;
    due_date: string | null;
    archived_at: string | null;
    deleted_at: string | null;
    created_at: string | null;
    question_ids: unknown;
    test_type: string | null;
    lesson: { title: string | null } | null;
    practice_test: { name: string | null } | null;
    completed_at: string | null;
  };
  // Newest-assigned first. The list is the running record of
  // what the tutor has handed out, so the freshest work sits at
  // the top regardless of completion or due-date status.
  const assignments = (
    (assignmentJunctions ?? []) as unknown as { completed_at: string | null; assignment: Assignment }[]
  )
    .map((j) => ({ ...j.assignment, completed_at: j.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at)
    .sort((a, b) => {
      const aAt = a.created_at ? Date.parse(a.created_at) : 0;
      const bAt = b.created_at ? Date.parse(b.created_at) : 0;
      return bAt - aAt;
    });

  // Best practice_session per assignment for deep-linking the report.
  // The assignment's own completed_at is the source of truth for whether
  // the work is done; the session status can lag (assignment auto-completes
  // when all underlying attempts exist, even if the session was never
  // explicitly finalized). So we accept any session here and let the
  // per-row `completed_at && reportSessionId` gate downstream decide
  // whether to render the link. Prefer completed > in_progress > other
  // when multiple sessions exist for one assignment.
  const assignmentIdsForSessions = assignments
    .map((a) => a.id)
    .filter((id): id is string => typeof id === 'string');
  const reportSessionByAssignment = new Map<string, string>();
  if (assignmentIdsForSessions.length > 0) {
    const { data: sessionRows } = await supabase
      .from('practice_sessions')
      .select('id, status, created_at, filter_criteria')
      .eq('user_id', studentId)
      .in('test_type', ['sat', 'act'])
      .in('filter_criteria->>assignment_id', assignmentIdsForSessions)
      .order('created_at', { ascending: false });
    const statusRank = (s: string | null | undefined) =>
      s === 'completed' ? 0 : s === 'in_progress' ? 1 : 2;
    const bestStatusByAssignment = new Map<string, string>();
    for (const r of sessionRows ?? []) {
      const fc = r.filter_criteria as { assignment_id?: string } | null;
      const aid = typeof fc?.assignment_id === 'string' ? fc.assignment_id : null;
      if (!aid) continue;
      const prev = bestStatusByAssignment.get(aid);
      if (!prev || statusRank(r.status) < statusRank(prev)) {
        reportSessionByAssignment.set(aid, r.id);
        bestStatusByAssignment.set(aid, r.status);
      }
    }
  }

  const daysToTest = daysUntil(student.satTestDate);

  return (
    <main className={s.container}>
      <Link href="/tutor/dashboard" className={s.breadcrumb}>
        ← Tutor dashboard
      </Link>

      {/* ---------- Header ---------- */}
      <header className={s.header}>
        <div className={s.eyebrow}>Student</div>
        <h1 className={s.h1}>{student.name}</h1>
        <div className={s.sub}>
          {student.email && <span>{student.email}</span>}
          {student.highSchool && (
            <span>
              {student.email && ' · '}
              {student.highSchool}
              {student.graduationYear ? ` · class of ${student.graduationYear}` : ''}
            </span>
          )}
        </div>
      </header>

      {/* ---------- Snapshot card ----------
           Single profile card grouping every header-row metric so
           the page doesn't open on a wall of pills. Two columns:
           activity (start date, attempts, last activity, etc.) on
           the left, score progression (target / starting / final /
           impact / reach) on the right. Effective start date
           defaults to the signup timestamp when start_date hasn't
           been set explicitly. Edit pill lives in the card header
           since both editable fields (target + start date) sit in
           the right column. */}
      <section className={s.snapshotCard}>
        <div className={s.snapshotHead}>
          <h2 className={s.snapshotTitle}>Snapshot</h2>
          <div className={s.snapshotHeadActions}>
            <Link href={`/tutor/students/${student.id}/plan`} className={s.cardHeaderLink}>
              Study plan →
            </Link>
            <EditTargetStartButton
              studentId={student.id}
              targetScore={student.targetScore ?? null}
              startDate={profileRow?.start_date ?? null}
            />
          </div>
        </div>
        <div className={s.snapshotCols}>
          <div className={s.snapshotCol}>
            <div className={s.snapshotColTitle}>Activity</div>
            <dl className={s.snapshotList}>
              <ProfileRow
                label="Start date"
                value={student.effectiveStartDate
                  ? (formatDate(student.effectiveStartDate) ?? '—')
                  : '—'}
                sub={student.startDate ? undefined : 'defaults to signup'}
              />
              {daysToTest != null && (
                <ProfileRow
                  label={daysToTest >= 0 ? 'Days to test' : 'Test date'}
                  value={daysToTest >= 0 ? daysToTest : 'Past'}
                  sub={student.satTestDate
                    ? formatDate(student.satTestDate) ?? undefined
                    : undefined}
                />
              )}
              <ProfileRow
                label="Last activity"
                value={formatRelativeShort(student.lastActivityAt) ?? '—'}
              />
              <ProfileRow
                label="Accuracy"
                value={student.accuracy != null ? `${student.accuracy}%` : '—'}
                sub={student.accuracy != null
                  ? `${student.correctAttempts} / ${student.totalAttempts}`
                  : undefined}
                tone={accuracyTone(student.accuracy)}
              />
              <ProfileRow
                label="Total attempts"
                value={student.totalAttempts.toLocaleString()}
              />
              <ProfileRow
                label="Last 7 days"
                value={student.weekAttempts}
              />
            </dl>
          </div>
          <div className={s.snapshotCol}>
            <div className={s.snapshotColTitle}>Scores</div>
            <dl className={s.snapshotList}>
              <ProfileRow label="Target" value={student.targetScore ?? '—'} />
              <ProfileRow
                label="Starting score"
                value={scoreSummary.startingScore ?? '—'}
              />
              <ProfileRow
                label="Final score"
                value={scoreSummary.finalScore ?? '—'}
              />
              <ProfileRow
                label="Impact"
                value={
                  scoreSummary.impact == null
                    ? '—'
                    : scoreSummary.impact > 0
                      ? `+${scoreSummary.impact}`
                      : String(scoreSummary.impact)
                }
                tone={impactTone(scoreSummary.impact)}
              />
              {student.targetScore != null && (
                <ProfileRow
                  label="Target reach"
                  value={
                    scoreSummary.targetReachPct == null
                      ? '—'
                      : `${scoreSummary.targetReachPct}%`
                  }
                  tone={reachTone(scoreSummary.targetReachPct)}
                />
              )}
            </dl>
          </div>
        </div>
      </section>

      {/* ---------- Performance ----------
           Same skill-segmented bars the student sees on their own
           dashboard — surface them here so a tutor opens the
           detail page and can read where the student is strong /
           weak without bouncing through a separate report. The
           "More statistics" link goes to the deeper, tutor-only
           view (per-skill table, daily-activity heatmap, by-
           difficulty rollup, weekly trend). */}
      {(aggregate.performance.math.domains.length > 0 ||
        aggregate.performance.rw.domains.length > 0) && (
        <section className={s.perfSection}>
          <div className={s.perfHeader}>
            <div className={s.sectionLabel}>
              <IconTile icon={PerformanceIcon} palette="cyan" size="sm" />
              SAT performance · last 90 days
            </div>
            <Link
              href={`/tutor/students/${student.id}/stats`}
              className={s.cardHeaderLink}
            >
              More statistics →
            </Link>
          </div>
          <div className={s.perfGrid}>
            <SkillBreakdownCard
              title="Math"
              tone="math"
              domains={toBreakdownDomains(aggregate.performance.math.domains)}
            />
            <SkillBreakdownCard
              title="Reading & Writing"
              tone="rw"
              domains={toBreakdownDomains(aggregate.performance.rw.domains)}
            />
          </div>
        </section>
      )}

      {/* ---------- ACT performance ----------
          Same layout shape as SAT — sections-as-domains,
          categories-as-skills mapped onto the SkillBreakdownCard
          shape. Hides when the student has no ACT attempts in the
          90-day window (§3.4 "per-test-type sections hide when
          there's no data"). When SAT has no data and ACT does,
          this is the only performance card on the page; when both
          have data, the two cards stack with their test-type
          labels disambiguating them. */}
      {aggregateAct && aggregateAct.totalAttempts > 0
        && aggregateAct.performance.sections.length > 0 && (
        <section className={s.perfSection}>
          <div className={s.perfHeader}>
            <div className={s.sectionLabel}>
              <IconTile icon={PerformanceIcon} palette="cyan" size="sm" />
              ACT performance · last 90 days
            </div>
            {aggregateAct.totalAttempts > 0 && (
              <span className={s.cardHeaderLink}>
                {aggregateAct.totalAttempts} attempt
                {aggregateAct.totalAttempts === 1 ? '' : 's'}
                {aggregateAct.performance.pct != null
                  ? ` · ${aggregateAct.performance.pct}%`
                  : ''}
              </span>
            )}
          </div>
          <div className={s.perfGrid}>
            <SkillBreakdownCard
              title="ACT"
              tone="math"
              domains={aggregateAct.performance.sections.map((sec) => ({
                name: sec.label,
                correct: sec.correct,
                total: sec.total,
                skills: sec.categories.map((c) => ({
                  name: c.name,
                  correct: c.correct,
                  total: c.total,
                })),
              }))}
            />
          </div>
        </section>
      )}

      {/* ---------- Two-column body ----------
           Left column: the click-into surfaces a tutor reaches
           for most often (assignments, recent tests, sessions).
           Right column: glance / reference data + the
           occasionally-used add-actions.
      */}
      <div className={s.contentGrid}>
        <div className={s.colMain}>
          {/* Assignments */}
          <section className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.sectionLabel}>
                <IconTile icon={InboxIcon} palette="navy" size="sm" />
                Assignments
              </div>
              <Link href={`/tutor/assignments/new?student=${student.id}`} className={s.cardHeaderLink}>
                + New assignment
              </Link>
            </div>
            {assignments.length === 0 ? (
              <p className={s.empty}>This student has no assignments.</p>
            ) : (
              <ul className={s.assignmentList}>
                {assignments.map((a) => {
                  const title = a.title
                    ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
                    ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
                    ?? 'Assignment';
                  const n = Array.isArray(a.question_ids) ? (a.question_ids as unknown[]).length : null;
                  const reportSessionId = reportSessionByAssignment.get(a.id) ?? null;
                  const rowHref = reportSessionId
                    ? `/tutor/sessions/${reportSessionId}`
                    : `/tutor/assignments/${a.id}`;
                  return (
                    <li key={a.id}>
                      <Link
                        href={rowHref}
                        className={a.completed_at ? `${s.assignmentRow} ${s.assignmentRowDone}` : s.assignmentRow}
                      >
                        <span className={s.assignmentType}>{a.assignment_type}</span>
                        {a.test_type === 'act' && (
                          <span className={s.actPill}>ACT</span>
                        )}
                        <span className={s.assignmentTitle}>
                          {title}
                          {n != null && <span className={s.assignmentCount}> · {n} q{n === 1 ? '' : 's'}</span>}
                        </span>
                        <span className={s.assignmentDates}>
                          {a.created_at && (
                            <span className={s.assignedDate}>
                              Assigned {formatDate(a.created_at)}
                            </span>
                          )}
                          {a.due_date && (
                            <span className={isPastDueDate(a.due_date) && !a.completed_at ? s.dueOverdue : s.due}>
                              Due {formatDate(a.due_date)}
                            </span>
                          )}
                        </span>
                        {a.completed_at && reportSessionId && (
                          <span className={s.reportPill}>View report →</span>
                        )}
                        {a.completed_at && !reportSessionId && (
                          <span className={s.completedTag}>Completed</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Recent practice tests */}
          <section className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.sectionLabel}>
                <IconTile icon={TestIcon} palette="cyan" size="sm" />
                Recent practice tests
              </div>
            </div>
            {testRows.length === 0 ? (
              <p className={s.empty}>No practice tests yet.</p>
            ) : (
              <ul className={s.testList}>
                {testRows.map((t) => (
                  <li key={t.id} className={s.testRowWrap}>
                    <Link
                      href={t.status === 'completed'
                        ? `/tutor/students/${student.id}/tests/${t.id}/results`
                        : `/tutor/students/${student.id}`}
                      className={s.testRow}
                    >
                      <div className={s.testRowLeft}>
                        <div className={s.testRowName}>
                          {t.testName}
                          {t.sectionsOnly && (
                            <span className={s.sectionsOnlyPill}>
                              {t.sectionsOnly === 'RW' ? 'R&W only' : 'Math only'}
                            </span>
                          )}
                        </div>
                        <div className={s.testRowMeta}>
                          <span className={s.mono}>{t.testCode}</span>
                          {t.testCode && ' · '}
                          {formatRelativeShort(t.timestamp) ?? '—'}
                          {t.status !== 'completed' && (
                            <span className={s.testRowTag}>
                              {' · '}{t.status === 'in_progress' ? 'In progress' : 'Abandoned'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={s.testRowScores}>
                        {t.status !== 'completed' ? (
                          <span className={s.muted}>—</span>
                        ) : t.composite != null ? (
                          <>
                            <ScorePill label="Total" value={t.composite} />
                            <ScorePill label="RW"   value={t.rwScaled} subject="RW" />
                            <ScorePill label="Math" value={t.mathScaled} subject="MATH" />
                          </>
                        ) : t.sectionsOnly === 'RW' && t.rwScaled != null ? (
                          <ScorePill label="RW only" value={t.rwScaled} subject="RW" />
                        ) : t.sectionsOnly === 'MATH' && t.mathScaled != null ? (
                          <ScorePill label="Math only" value={t.mathScaled} subject="MATH" />
                        ) : (
                          <span className={s.muted}>—</span>
                        )}
                      </div>
                    </Link>
                    <DeletePracticeTestButton
                      studentId={student.id}
                      attemptId={t.id}
                      testName={t.testName}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Recent practice sessions */}
          <section className={s.card}>
            <div className={s.cardHeader}>
              <div className={s.sectionLabel}>
                <IconTile icon={PencilIcon} palette="gold" size="sm" />
                Recent practice sessions
              </div>
            </div>
            {sessionRowsView.length === 0 ? (
              <p className={s.empty}>No practice sessions yet.</p>
            ) : (
              <ul className={s.sessionList}>
                {sessionRowsView.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.completed
                        ? `/tutor/sessions/${row.id}`
                        : `/tutor/students/${student.id}`}
                      className={s.sessionRow}
                    >
                      <div className={s.sessionRowLeft}>
                        <div className={s.sessionRowDate}>
                          {formatRelativeShort(row.createdAt) ?? '—'}
                          {row.testType === 'act' && (
                            <span className={s.actPill}>ACT</span>
                          )}
                        </div>
                        <div className={s.sessionRowMeta}>
                          {row.total} question{row.total === 1 ? '' : 's'}
                          {!row.completed && <span className={s.sessionRowTag}> · In progress</span>}
                        </div>
                      </div>
                      {row.completed ? (
                        <span className={s.reportPill}>View report →</span>
                      ) : (
                        <span className={s.sessionRowChevron} aria-hidden="true">→</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className={s.colSide}>
          {/* Score progress chart — compact glance only renders when
              we have at least one official score on file. The
              target value sits in the section header so the chart
              body doesn't reserve right margin for the label. */}
          {(officialScores ?? []).length > 0 && (
            <section className={s.card}>
              <div className={s.cardHeader}>
                <div className={s.sectionLabel}>Progress</div>
                {student.targetScore != null && (
                  <span className={s.cardHeaderHint}>
                    Target <strong>{student.targetScore}</strong>
                  </span>
                )}
              </div>
              <ScoreProgressChart
                scores={officialScores ?? []}
                targetScore={student.targetScore}
              />
            </section>
          )}

          {/* Test registrations */}
          <TestRegistrationsCard
            studentId={student.id}
            registrations={(registrations ?? []).map((r) => ({
              id: r.id as string,
              test_date: r.test_date as string,
            }))}
          />

          {/* Official scores */}
          <OfficialScoresCard
            studentId={student.id}
            scores={(officialScores ?? []) as unknown as Array<{
              id: string; test_date: string; rw_score: number; math_score: number;
              composite_score: number; test_type: string | null;
              domain_ini: number | null; domain_cas: number | null;
              domain_eoi: number | null; domain_sec: number | null;
              domain_alg: number | null; domain_atm: number | null;
              domain_pam: number | null; domain_geo: number | null;
            }>}
          />

          {/* Upload Bluebook (just the action trigger) */}
          <UploadBluebookCard
            studentId={student.id}
            tests={(publishedTests ?? []) as Array<{ id: string; name: string; code: string | null }>}
          />
        </aside>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

interface ProfileRowProps {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'good' | 'ok' | 'bad';
}
function ProfileRow({ label, value, sub, tone }: ProfileRowProps) {
  const valueCls = [
    s.snapshotRowValueMain,
    tone === 'good' ? s.snapshotRowGood : null,
    tone === 'ok'   ? s.snapshotRowOk   : null,
    tone === 'bad'  ? s.snapshotRowBad  : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={s.snapshotRow}>
      <dt className={s.snapshotRowLabel}>{label}</dt>
      <dd className={s.snapshotRowValue}>
        <div className={valueCls}>{value}</div>
        {sub && <div className={s.snapshotRowSub}>{sub}</div>}
      </dd>
    </div>
  );
}

interface ScorePillProps {
  label: string;
  value: number | null;
  subject?: SubjectCode;
}
function ScorePill({ label, value, subject }: ScorePillProps) {
  if (value == null) return null;
  const cls = [
    s.scorePill,
    subject === 'RW'   ? s.scorePillRw   : null,
    subject === 'MATH' ? s.scorePillMath : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.scorePillValue}>{value}</div>
      <div className={s.scorePillLabel}>{label}</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className={s.container}>
      <Link href="/tutor/dashboard" className={s.breadcrumb}>← Tutor dashboard</Link>
      <header className={s.header}>
        <h1 className={s.h1}>Student detail</h1>
        <p className={s.sub}>Something went wrong loading this student.</p>
      </header>
      <div className={s.errorCard} role="alert">{message}</div>
    </main>
  );
}

// Adapter from loadDashboardAggregate's domain shape to the
// SkillBreakdownCard's `{ name, correct, total, skills }` shape.
// Mirrors the helper on the student dashboard so the two surfaces
// pass identical inputs into the shared card.
function toBreakdownDomains(
  domains: Array<{
    name: string;
    correct: number;
    total: number;
    skills: Array<{ name: string; correct: number; total: number }>;
  }>,
) {
  return domains.map((d) => ({
    name:    d.name,
    correct: d.correct,
    total:   d.total,
    skills:  d.skills ?? [],
  }));
}

function accuracyTone(pct: number | null): 'good' | 'ok' | 'bad' | undefined {
  if (pct == null) return undefined;
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'bad';
}

function impactTone(delta: number | null): 'good' | 'bad' | undefined {
  if (delta == null || delta === 0) return undefined;
  return delta > 0 ? 'good' : 'bad';
}

// Roster's archived view uses a four-step scale (hit / close / mid /
// low). Three-step here to fit the StatTile palette (good / ok / bad).
function reachTone(pct: number | null): 'good' | 'ok' | 'bad' | undefined {
  if (pct == null) return undefined;
  if (pct >= 100) return 'good';
  if (pct >= 90) return 'ok';
  return 'bad';
}


function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
