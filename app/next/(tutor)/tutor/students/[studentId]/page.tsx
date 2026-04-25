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
import { ImportPracticeHistoryButton } from './ImportPracticeHistoryButton';
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

  // Six parallel reads. RLS uses can_view() on each table, so an
  // empty result on the stats row means the caller can't see this
  // student → 404.
  const [
    { data: studentRows, error: rpcErr },
    { data: profileRow },
    { count: v1AttemptCount },
    { data: assignmentJunctions },
    { data: testAttemptRows },
    { data: sessionRows },
  ] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('*')
      .eq('user_id', studentId),
    supabase
      .from('profiles')
      .select('practice_test_v2_imported_at')
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
          id, assignment_type, title, due_date, archived_at, deleted_at,
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
  const student = {
    id: row.user_id ?? studentId,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || 'Unknown',
    email: row.email,
    targetScore: row.target_sat_score,
    highSchool: row.high_school,
    graduationYear: row.graduation_year,
    satTestDate: row.sat_test_date,
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
    question_ids: unknown;
    lesson: { title: string | null } | null;
    practice_test: { name: string | null } | null;
    completed_at: string | null;
  };
  const assignments = (
    (assignmentJunctions ?? []) as unknown as { completed_at: string | null; assignment: Assignment }[]
  )
    .map((j) => ({ ...j.assignment, completed_at: j.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at)
    .sort((a, b) => {
      const aDone = a.completed_at != null;
      const bDone = b.completed_at != null;
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aDue = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
      const bDue = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    });

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

      {/* ---------- Stat tiles ---------- */}
      <section className={s.statsRow}>
        <StatTile label="Target" value={student.targetScore ?? '—'} />
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
      </section>

      {/* ---------- Assignments ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Assignments</div>
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
              return (
                <li key={a.id}>
                  <Link
                    href={`/tutor/assignments/${a.id}`}
                    className={a.completed_at ? `${s.assignmentRow} ${s.assignmentRowDone}` : s.assignmentRow}
                  >
                    <span className={s.assignmentType}>{a.assignment_type}</span>
                    <span className={s.assignmentTitle}>
                      {title}
                      {n != null && <span className={s.assignmentCount}> · {n} q{n === 1 ? '' : 's'}</span>}
                    </span>
                    {a.due_date && !a.completed_at && (
                      <span className={isOverdue(a.due_date) ? s.dueOverdue : s.due}>
                        Due {formatDate(a.due_date)}
                      </span>
                    )}
                    {a.completed_at && (
                      <span className={s.completedTag}>Completed</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Recent practice tests ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Recent practice tests</div>
        </div>
        {testRows.length === 0 ? (
          <p className={s.empty}>No practice tests yet.</p>
        ) : (
          <ul className={s.testList}>
            {testRows.map((t) => (
              <li key={t.id}>
                <Link
                  href={t.status === 'completed'
                    ? `/practice/test/attempt/${t.id}/results`
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

      {/* ---------- Recent practice sessions ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Recent practice sessions</div>
        </div>
        {sessionRowsView.length === 0 ? (
          <p className={s.empty}>No practice sessions yet.</p>
        ) : (
          <ul className={s.sessionList}>
            {sessionRowsView.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.completed
                    ? `/practice/review/${row.id}`
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
                  <span className={s.sessionRowChevron} aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Practice history v2 import ---------- */}
      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Practice history v2 import</div>
        </div>
        <ImportPracticeHistoryButton
          studentId={student.id}
          importedAt={profileRow?.practice_test_v2_imported_at ?? null}
          hasV1History={(v1AttemptCount ?? 0) > 0}
        />
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
