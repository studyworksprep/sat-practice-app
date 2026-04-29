// Tutor dashboard. Server Component — the whole page runs
// server-side, no client island because nothing is interactive
// here beyond row clicks (which are plain Next.js Links).
//
// Data sources:
//   - student_practice_stats view for the roster aggregates;
//     RLS on the underlying tables uses can_view(), so the view
//     returns only the students the caller is allowed to see.
//   - practice_test_attempts_v2 (scoped to the visible students)
//     for the "Recent tests" panel.
//
// Layout mirrors the student dashboard vocabulary: banner, stats
// row, primary content panel (students table), secondary panel
// (recent test attempts across the roster).

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatRelativeShort } from '@/lib/formatters';
import { RosterIcon, TestIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { Sparkline } from '@/lib/ui/Sparkline';
import { Delta } from '@/lib/ui/Delta';
import { loadTutorDashboard } from '@/lib/practice/load-tutor-dashboard';
import { RosterFinder } from './RosterFinder';
import s from './Dashboard.module.css';

export const dynamic = 'force-dynamic';

const STUDENT_LIMIT = 100;
// Weeks of cohort attempt-volume to plot under the "Attempts · 7d"
// stat tile. 8 weeks is enough to show a multi-week trend without
// dragging in pre-cutover data.
const SPARK_WEEKS = 8;

export default async function TutorDashboardPage() {
  const { user, profile } = await requireUser();

  // Role gate. The (tutor) layout already enforces this, but
  // belt-and-suspenders keeps this page correct if the layout
  // ever goes missing.
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // Cached payload — student_practice_stats view + recent test
  // attempts + roster weekly trend. TTL-only at 60s; tag-based
  // invalidation isn't worth the cross-roster fan-out it would
  // require from every student answer-submission.
  let payload;
  try {
    payload = await loadTutorDashboard(user.id);
  } catch (err) {
    return (
      <main className={s.container}>
        <header className={s.header}>
          <div className={s.eyebrow}>Tutor</div>
          <h1 className={s.h1}>
            {profile.first_name ? `Hi, ${profile.first_name}` : 'Tutor dashboard'}
          </h1>
        </header>
        <div className={s.errorCard} role="alert">
          Failed to load students: {err?.message ?? String(err)}
        </div>
      </main>
    );
  }

  const { rawStudents, recentTestAttempts, trendRows } = payload;
  const students = rawStudents.slice(0, STUDENT_LIMIT).map((row) => {
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
  });

  const cohort = {
    total: rawStudents.length,
    visible: students.length,
    activeThisWeek: students.filter((s) => s.weekAttempts > 0).length,
    attemptsThisWeek: students.reduce((acc, s) => acc + s.weekAttempts, 0),
  };

  // Normalize trend rows into the shape Sparkline + Delta expect.
  // The RPC returns oldest → newest so the last bucket is the
  // current week — matches `weekAttempts` on the stat tile.
  const trend = (trendRows ?? []).map((r) => ({
    startIso: r.start_iso,
    endIso: r.end_iso,
    attempts: Number(r.attempts ?? 0),
    correct: Number(r.correct ?? 0),
    accuracy: r.accuracy == null ? null : Number(r.accuracy),
  }));
  const lastWeek = trend.length > 0 ? trend[trend.length - 1] : null;
  const priorWeek = trend.length > 1 ? trend[trend.length - 2] : null;

  const studentsById = new Map(students.map((s) => [s.id, s]));
  const testRows = (recentTestAttempts ?? []).map((r) => ({
    id: r.id,
    studentId: r.user_id,
    studentName: studentsById.get(r.user_id)?.name ?? '—',
    testName: r.practice_test?.name ?? 'Practice test',
    testCode: r.practice_test?.code ?? '',
    status: r.status,
    composite: r.composite_score,
    rwScaled: r.rw_scaled,
    mathScaled: r.math_scaled,
    timestamp: r.finished_at ?? r.started_at,
  }));

  const greeting = profile.first_name
    ? `Welcome back, ${profile.first_name}.`
    : 'Welcome back.';

  return (
    <main className={s.container}>
      {/* ---------- Banner ---------- */}
      <section className={s.banner}>
        <div className={s.bannerText}>
          <div className={s.bannerGreeting}>{greeting}</div>
          <div className={s.bannerSub}>
            {cohort.total === 0
              ? 'No students assigned yet.'
              : `${cohort.total} student${cohort.total === 1 ? '' : 's'} · ${cohort.activeThisWeek} active this week · ${cohort.attemptsThisWeek} practice attempts in the last 7 days`}
          </div>
        </div>
        <div className={s.bannerActions}>
          <Link href="/tutor/assignments/new" className={s.btnPrimary}>New assignment</Link>
        </div>
      </section>

      {/* ---------- Cohort stat tiles ---------- */}
      {cohort.total > 0 && (
        <section className={s.statsRow}>
          <StatTile label="Students" value={cohort.total} />
          <StatTile
            label="Active this week"
            value={cohort.activeThisWeek}
            sub={
              cohort.total === 0
                ? null
                : `${Math.round((cohort.activeThisWeek / cohort.total) * 100)}% of roster`
            }
          />
          <StatTile
            label="Attempts · 7d"
            value={cohort.attemptsThisWeek.toLocaleString()}
            spark={
              trend.length > 0 ? (
                <Sparkline
                  data={trend}
                  field="attempts"
                  tone="cyan"
                  ariaLabel={`Cohort weekly attempts over the last ${SPARK_WEEKS} weeks`}
                />
              ) : null
            }
            delta={
              lastWeek && priorWeek ? (
                <Delta
                  current={lastWeek.attempts}
                  prior={priorWeek.attempts}
                  format="count"
                  suffix="vs last week"
                />
              ) : null
            }
          />
          <StatTile
            label="Roster size"
            value={cohort.visible < cohort.total ? `${cohort.visible}+` : cohort.visible}
          />
        </section>
      )}

      {/* ---------- Roster finder ---------- */}
      {cohort.total === 0 ? (
        <section className={s.card}>
          <div className={s.emptyHero}>
            <IconTile icon={RosterIcon} palette="gold" size="lg" />
            <div className={s.empty}>
              You don&apos;t have any students assigned yet. Once an admin
              assigns them to you, they&apos;ll show up here.
            </div>
          </div>
        </section>
      ) : (
        <RosterFinder students={students} />
      )}

      {/* ---------- Recent test attempts across the roster ---------- */}
      {testRows.length > 0 && (
        <section className={s.card}>
          <div className={s.cardHeader}>
            <div className={s.sectionLabel}>
              <IconTile icon={TestIcon} palette="cyan" size="sm" />
              Recent practice tests
            </div>
          </div>
          <ul className={s.testList}>
            {testRows.map((t) => (
              <li key={t.id}>
                <Link
                  href={t.status === 'completed'
                    ? `/tutor/students/${t.studentId}/tests/${t.id}/results`
                    : `/tutor/students/${t.studentId}`}
                  className={s.testRow}
                >
                  <div className={s.testRowLeft}>
                    <div className={s.testRowName}>{t.studentName}</div>
                    <div className={s.testRowMeta}>
                      {t.testName} · {formatRelativeShort(t.timestamp) ?? '—'}
                      {t.status !== 'completed' && (
                        <span className={s.testRowTag}>
                          {' · '}
                          {t.status === 'in_progress' ? 'In progress' : 'Abandoned'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={s.testRowScores}>
                    {t.status === 'completed' && t.composite != null ? (
                      <>
                        <ScorePill label="Total" value={t.composite} />
                        <ScorePill label="RW" value={t.rwScaled} tone="rw" />
                        <ScorePill label="Math" value={t.mathScaled} tone="math" />
                      </>
                    ) : (
                      <span className={s.muted}>—</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function StatTile({ label, value, sub = null, spark = null, delta = null }) {
  return (
    <div className={s.statCard}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValueRow}>
        <div className={s.statValue}>{value}</div>
        {spark}
      </div>
      {(sub || delta) && (
        <div className={s.statSubRow}>
          {sub && <div className={s.statLabel} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{sub}</div>}
          {delta}
        </div>
      )}
    </div>
  );
}

function ScorePill({ label, value, tone }) {
  if (value == null) return null;
  const cls = [s.scorePill, tone === 'rw' ? s.scorePillRw : tone === 'math' ? s.scorePillMath : null]
    .filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.scorePillValue}>{value}</div>
      <div className={s.scorePillLabel}>{label}</div>
    </div>
  );
}
