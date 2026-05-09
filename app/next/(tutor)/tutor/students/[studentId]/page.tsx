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
import { formatDate, formatRelativeShort } from '@/lib/formatters';
import { loadDashboardAggregate } from '@/lib/practice/load-dashboard-aggregate';
import { SkillBreakdownCard } from '@/lib/practice/SkillBreakdownCard';
import {
  ClipboardCheckIcon,
  InboxIcon,
  PencilIcon,
  PerformanceIcon,
  TestIcon,
} from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { EditTargetStartButton } from './EditTargetStartModal';
import { ImportPracticeHistoryButton } from './ImportPracticeHistoryButton';
import { MigrateToNextButton } from './MigrateToNextButton';
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
    { count: v1AttemptCount },
    { data: assignmentJunctions },
    { data: testAttemptRows },
    { data: sessionRows },
    { data: registrations },
    { data: officialScores },
    aggregate,
  ] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('*')
      .eq('user_id', studentId),
    supabase
      .from('profiles')
      .select('practice_test_v2_imported_at, created_at, start_date, ui_version')
      .eq('id', studentId)
      .maybeSingle(),
    supabase
      .from('practice_test_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', studentId),
    supabase
      .from('assignment_students_v2')
      .select(`
        completed_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, archived_at, deleted_at, created_at,
          question_ids,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', studentId),
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, status, started_at, finished_at,
        composite_score, rw_scaled, math_scaled,
        practice_test:practice_tests_v2(name, code)
      `)
      .eq('user_id', studentId)
      .order('started_at', { ascending: false })
      .limit(RECENT_TESTS_LIMIT),
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, current_position, status')
      .eq('user_id', studentId)
      .eq('mode', 'practice')
      .neq('status', 'abandoned')
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
    loadDashboardAggregate(studentId),
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

  // Test attempts — keep status-aware, surface scores on completed
  // ones, link by status.
  const testRows = (testAttemptRows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    timestamp: r.finished_at ?? r.started_at,
    composite: r.composite_score,
    rwScaled: r.rw_scaled,
    mathScaled: r.math_scaled,
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

  // Latest completed practice_session per assignment, so the
  // assignment row can deep-link to the report when one exists.
  // One IN-query covers every assignment shown on the page; in
  // JS we keep only the most recent completed session per
  // assignment_id.
  const assignmentIdsForSessions = assignments
    .map((a) => a.id)
    .filter((id): id is string => typeof id === 'string');
  const reportSessionByAssignment = new Map<string, string>();
  if (assignmentIdsForSessions.length > 0) {
    const { data: sessionRows } = await supabase
      .from('practice_sessions')
      .select('id, status, created_at, filter_criteria')
      .eq('user_id', studentId)
      .eq('status', 'completed')
      .in('filter_criteria->>assignment_id', assignmentIdsForSessions)
      .order('created_at', { ascending: false });
    for (const r of sessionRows ?? []) {
      const fc = r.filter_criteria as { assignment_id?: string } | null;
      const aid = typeof fc?.assignment_id === 'string' ? fc.assignment_id : null;
      if (aid && !reportSessionByAssignment.has(aid)) {
        reportSessionByAssignment.set(aid, r.id);
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

      {/* ---------- Stat tiles ----------
           Target + Start date sit at the front since both are
           tutor-editable (single combined modal at the right).
           Effective start date defaults to the signup timestamp
           when start_date hasn't been set explicitly. */}
      <section className={s.statsRow}>
        <StatTile label="Target" value={student.targetScore ?? '—'} />
        <StatTile
          label="Start date"
          value={student.effectiveStartDate ? (formatDate(student.effectiveStartDate) ?? '—') : '—'}
          subtitle={student.startDate ? undefined : 'defaults to signup'}
        />
        <StatTile
          label="Accuracy"
          value={student.accuracy != null ? `${student.accuracy}%` : '—'}
          subtitle={student.accuracy != null ? `${student.correctAttempts} / ${student.totalAttempts}` : undefined}
          tone={accuracyTone(student.accuracy)}
        />
        <StatTile label="Total attempts" value={student.totalAttempts.toLocaleString()} />
        <StatTile label="Last 7 days" value={student.weekAttempts} />
        {daysToTest != null && (
          <StatTile
            label={daysToTest >= 0 ? 'Days to test' : 'Test date'}
            value={daysToTest >= 0 ? daysToTest : 'Past'}
            subtitle={student.satTestDate ? formatDate(student.satTestDate) ?? undefined : undefined}
          />
        )}
        <StatTile
          label="Last activity"
          value={formatRelativeShort(student.lastActivityAt) ?? '—'}
        />
        <div className={s.statsRowAction}>
          <EditTargetStartButton
            studentId={student.id}
            targetScore={student.targetScore ?? null}
            startDate={profileRow?.start_date ?? null}
          />
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
              Performance · last 90 days
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
                            <span className={isOverdue(a.due_date) && !a.completed_at ? s.dueOverdue : s.due}>
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
                  <li key={t.id}>
                    <Link
                      href={t.status === 'completed'
                        ? `/tutor/students/${student.id}/tests/${t.id}/results`
                        : `/tutor/students/${student.id}`}
                      className={s.testRow}
                    >
                      <div className={s.testRowLeft}>
                        <div className={s.testRowName}>{t.testName}</div>
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
                        {t.status === 'completed' && t.composite != null ? (
                          <>
                            <ScorePill label="Total" value={t.composite} />
                            <ScorePill label="RW"   value={t.rwScaled} subject="RW" />
                            <ScorePill label="Math" value={t.mathScaled} subject="MATH" />
                          </>
                        ) : (
                          <span className={s.muted}>—</span>
                        )}
                      </div>
                    </Link>
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
          <UploadBluebookCard studentId={student.id} />
        </aside>
      </div>

      {/* ---------- Practice history v2 import — bottom strip,
                    rarely needed once the cutover has run.       */}
      <section className={`${s.card} ${s.footerCard}`}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>
            <IconTile icon={ClipboardCheckIcon} palette="slate" size="sm" />
            Practice history v2 import
          </div>
        </div>
        <ImportPracticeHistoryButton
          studentId={student.id}
          importedAt={profileRow?.practice_test_v2_imported_at ?? null}
          hasV1History={(v1AttemptCount ?? 0) > 0}
        />
        {(profile.role === 'admin' || profile.role === 'manager') && (
          <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px dashed var(--border)' }}>
            <MigrateToNextButton
              studentId={student.id}
              currentUiVersion={(profileRow as { ui_version?: string | null } | null)?.ui_version ?? null}
            />
          </div>
        )}
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

interface StatTileProps {
  label: string;
  value: number | string;
  subtitle?: string;
  tone?: 'good' | 'ok' | 'bad';
}
function StatTile({ label, value, subtitle, tone }: StatTileProps) {
  const cls = [
    s.statCard,
    tone === 'good' ? s.statGood : null,
    tone === 'ok'   ? s.statOk   : null,
    tone === 'bad'  ? s.statBad  : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statLabel}>{label}</div>
      {subtitle && <div className={s.statSub}>{subtitle}</div>}
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

function isOverdue(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
