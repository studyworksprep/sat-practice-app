// Tutor dashboard. Server Component — the whole page runs
// server-side, no client island because nothing is interactive
// here beyond row clicks (which are plain Next.js Links).
//
// Data sources:
//   - profiles (RLS-scoped via can_view) for the roster — name +
//     static profile detail only. Per-student perf metrics
//     deliberately dropped: the per-student detail page is where
//     that data belongs, and aggregating across the whole attempts
//     table on this surface was the slowest thing on the page.
//   - practice_test_attempts_v2 (limit 5) for the "Recent practice
//     tests" panel.
//
// Layout: banner with roster size, primary content panel
// (RosterFinder), secondary panel (recent test attempts).

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatRelativeShort } from '@/lib/formatters';
import { TestIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { loadTutorDashboard } from '@/lib/practice/load-tutor-dashboard';
import { RosterFinder } from './RosterFinder';
import s from './Dashboard.module.css';

export const dynamic = 'force-dynamic';

const STUDENT_LIMIT = 100;

export default async function TutorDashboardPage() {
  const { user, profile } = await requireUser();

  // Role gate. The (tutor) layout already enforces this, but
  // belt-and-suspenders keeps this page correct if the layout
  // ever goes missing.
  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

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

  const { rawStudents, recentTestAttempts } = payload;
  const students = rawStudents.slice(0, STUDENT_LIMIT).map((row) => ({
    id: row.user_id,
    name: [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || '—',
    email: row.email,
    targetScore: row.target_sat_score,
    highSchool: row.high_school,
    graduationYear: row.graduation_year,
  }));

  const cohort = {
    total: rawStudents.length,
    visible: students.length,
  };

  const studentsById = new Map(students.map((st) => [st.id, st]));
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
              : `${cohort.total} student${cohort.total === 1 ? '' : 's'} on your roster`}
          </div>
        </div>
        <div className={s.bannerActions}>
          <Link href="/tutor/assignments/new" className={s.btnPrimary}>New assignment</Link>
        </div>
      </section>

      {/* ---------- Roster finder ---------- */}
      {cohort.total === 0 ? (
        <section className={s.card}>
          <div className={s.emptyHero}>
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
