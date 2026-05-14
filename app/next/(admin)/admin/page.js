// Admin landing page — first carve-out from the 2,366-line legacy
// AdminDashboard.js. See docs/architecture-plan.md §3.4 and Phase 2
// in §4.
//
// Read-only. The legacy AdminDashboard is a single client component
// with seven tabs (overview, performance, teachers, users, content,
// questionsV2, questionsV2Bulk). Phase 4 of the rebuild plans to
// decompose it completely; this file is the first step — a Server
// Component landing page that renders the overview headline stats
// inline, without an /api/admin/platform-stats round-trip and
// without the 1,000-line client-side state machine.
//
// Visual: same hairline-card vocabulary as the student + tutor
// dashboards (eyebrow + serif H1, --card sections, design-token
// tints), so admin no longer reads as a different app from
// everything else in the new tree.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { StatCard } from '@/lib/ui/StatCard';
import { formatShortDate } from '@/lib/formatters';
import { BulkMigrateButton } from './BulkMigrateButton';
import s from './AdminOverview.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminLandingPage() {
  const { profile, supabase } = await requireUser();

  // Layout already gates admin-only — this is belt-and-suspenders
  // so direct deep links to /admin from a wrong-role session
  // can't bypass the redirect.
  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') {
      redirect('/tutor/dashboard');
    }
    if (profile.role === 'student') {
      redirect('/dashboard');
    }
    redirect('/');
  }

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  const [
    auToday,
    au7,
    au30,
    { count: totalQuestions },
    { data: roleCounts },
    { count: recentSignups },
    { count: attempts30d },
    { count: practiceTests30d },
    { data: volumeWeeks },
    { count: legacyStudentsRemaining },
  ] = await Promise.all([
    supabase.rpc('count_distinct_users_since', { since: todayStart.toISOString() }),
    supabase.rpc('count_distinct_users_since', { since: d7.toISOString() }),
    supabase.rpc('count_distinct_users_since', { since: d30.toISOString() }),
    supabase
      .from('questions_v2')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true)
      .eq('is_broken', false),
    // Roll up users by role via a small select-and-tally. Cheaper
    // than five separate count queries for a handful of rows.
    supabase.from('profiles').select('role').limit(50000),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', d7.toISOString()),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('source', 'practice')
      .gte('created_at', d30.toISOString()),
    supabase
      .from('practice_test_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('finished_at', d30.toISOString()),
    supabase.rpc('get_practice_volume_by_week', { weeks: 8 }),
    // Count of students still pending the v1 → v2 cutover. Drives
    // the BulkMigrateButton's "X remaining" badge on first paint;
    // the action returns a fresh count after each batch.
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .or('ui_version.is.null,ui_version.eq.legacy'),
  ]);

  const activeUsers = {
    today: auToday?.error ? null : auToday?.data ?? null,
    d7: au7?.error ? null : au7?.data ?? null,
    d30: au30?.error ? null : au30?.data ?? null,
  };

  const weekBars = (volumeWeeks ?? []).map((w) => ({
    label: formatShortDate(w.week_start),
    practice: Number(w.practice_count ?? 0),
    test: Number(w.test_count ?? 0),
    total: Number(w.practice_count ?? 0) + Number(w.test_count ?? 0),
  }));
  const maxTotal = Math.max(1, ...weekBars.map((b) => b.total));
  const totalTestsCompleted = weekBars.reduce((acc, b) => acc + b.test, 0);

  const usersByRole = { practice: 0, student: 0, teacher: 0, manager: 0, admin: 0 };
  for (const row of roleCounts ?? []) {
    if (row.role && Object.prototype.hasOwnProperty.call(usersByRole, row.role)) {
      usersByRole[row.role] += 1;
    }
  }
  const totalUsers = Object.values(usersByRole).reduce((acc, n) => acc + n, 0);

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Admin</div>
        <h1 className={s.h1}>
          {profile.first_name ? `Hi, ${profile.first_name}` : 'Admin'}
        </h1>
        <p className={s.sub}>
          Studyworks platform overview. Use the navigation up top to
          drill into specific areas.
        </p>
      </header>

      <section className={s.section}>
        <div className={s.sectionLabel}>Practice volume · 8 weeks</div>
        {weekBars.length === 0 ? (
          <p className={s.empty}>No activity data yet.</p>
        ) : (
          <>
            <div className={s.chart}>
              {weekBars.map((b, i) => {
                const practiceH = (b.practice / maxTotal) * 100;
                const testH = (b.test / maxTotal) * 100;
                return (
                  <div key={i} className={s.barColumn}>
                    <div
                      className={s.barStack}
                      title={`${b.practice} practice · ${b.test} test`}
                    >
                      <div
                        className={`${s.barSegment} ${s.barSegmentTest}`}
                        style={{ height: `${testH}%` }}
                      />
                      <div
                        className={`${s.barSegment} ${s.barSegmentPractice}`}
                        style={{ height: `${practiceH}%` }}
                      />
                    </div>
                    <div className={s.barLabel}>{b.label}</div>
                    <div className={s.barCount}>{b.total}</div>
                  </div>
                );
              })}
            </div>
            <div className={s.legend}>
              <span className={s.legendItem}>
                <span className={`${s.legendDot} ${s.legendDotPractice}`} />
                Practice
              </span>
              <span className={s.legendItem}>
                <span className={`${s.legendDot} ${s.legendDotTest}`} />
                Practice tests
              </span>
              <span className={s.legendTotal}>
                {totalTestsCompleted} test{totalTestsCompleted === 1 ? '' : 's'} completed
              </span>
            </div>
          </>
        )}
      </section>

      <section className={s.section}>
        <div className={s.sectionLabel}>Active users</div>
        <div className={s.statsGrid}>
          <StatCard label="Today" value={activeUsers.today} />
          <StatCard label="Last 7 days" value={activeUsers.d7} />
          <StatCard label="Last 30 days" value={activeUsers.d30} />
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionLabel}>Users by role</div>
        <div className={s.statsGrid}>
          <StatCard label="Total" value={totalUsers} />
          <StatCard label="Students" value={usersByRole.student} />
          <StatCard label="Practice (unpaid)" value={usersByRole.practice} />
          <StatCard label="Teachers" value={usersByRole.teacher} />
          <StatCard label="Managers" value={usersByRole.manager} />
          <StatCard label="Admins" value={usersByRole.admin} />
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionLabel}>30-day activity</div>
        <div className={s.statsGrid}>
          <StatCard label="Practice attempts" value={attempts30d ?? 0} />
          <StatCard label="Practice tests completed" value={practiceTests30d ?? 0} />
          <StatCard label="New signups (7 days)" value={recentSignups ?? 0} />
          <StatCard label="Published questions" value={totalQuestions ?? 0} />
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionLabel}>Migration cutover</div>
        <p className={s.help}>
          Bulk version of the per-student &ldquo;Migrate to new
          tree&rdquo; button. Each click imports legacy practice
          history, recomputes scores, backfills error notes, and flips{' '}
          <code>ui_version=&apos;next&apos;</code> for the next 50 students
          still on the legacy tree. Idempotent and per-student
          reversible.
        </p>
        <BulkMigrateButton initialRemaining={legacyStudentsRemaining ?? 0} />
      </section>

      <section className={s.section}>
        <div className={s.sectionLabel}>Manage</div>
        <p className={s.help}>
          The remaining admin sections are landing as Server Component
          pages, replacing the seven tabs of the legacy AdminDashboard
          one at a time. Some links below land on the
          &ldquo;under construction&rdquo; placeholder until their
          dedicated pages ship.
        </p>
        <div className={s.navGrid}>
          <NavCard href="/admin/users" title="User management" desc="Create, edit, and assign users." />
          <NavCard href="/admin/questions" title="Question content" desc="Browse and edit the question bank." />
          <NavCard href="/admin/performance" title="Student performance" desc="Aggregate stats across cohorts." />
          <NavCard href="/admin/content" title="Score conversions + thresholds" desc="Test-level config + curves." />
          <NavCard href="/admin/act/score-conversion" title="ACT score conversion" desc="Raw → scaled tables per ACT form." />
          <NavCard href="/admin/users/relationships" title="User relationships" desc="Teacher ↔ student assignments." />
          <NavCard href="/admin/users/codes" title="Signup codes" desc="Issue + audit invite codes." />
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionLabel}>Teach + train</div>
        <p className={s.help}>
          The tutor and student-facing surfaces an admin reaches via
          the divider clusters in the top nav. Listed here so they&apos;re
          discoverable from the overview, not just the nav bar.
        </p>
        <div className={s.navGrid}>
          <NavCard href="/tutor/roster"      title="Roster"      desc="Browse + manage students across all tutors." />
          <NavCard href="/tutor/assignments" title="Assignments" desc="Create + monitor practice assignments." />
          <NavCard href="/tutor/teachers"    title="Teachers"    desc="Manager view of every teacher's cohort." />
          <NavCard href="/tutor/training"    title="Train"       desc="Take practice and tests as a student would." />
        </div>
      </section>
    </main>
  );
}

function NavCard({ href, title, desc }) {
  return (
    <Link href={href} className={s.navCard}>
      <div className={s.navTitle}>{title}</div>
      <div className={s.navDesc}>{desc}</div>
    </Link>
  );
}
