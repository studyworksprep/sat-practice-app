// Admin landing page — first carve-out from the 2,366-line legacy
// AdminDashboard.js. See docs/architecture-plan.md §3.4 and Phase 2
// in §4.
//
// The legacy AdminDashboard is a single client component with seven
// tabs (overview, performance, teachers, users, content, questionsV2,
// questionsV2Bulk). Phase 4 of the rebuild plans to decompose it
// completely; this file is the first step — a Server Component
// landing page that renders the overview headline stats inline,
// without an /api/admin/platform-stats round-trip and without the
// 1,000-line client-side state machine.
//
// Subsequent Phase 2 commits add separate Server Component pages for
// each of the other six tabs at /admin/users, /admin/questions, etc.
// Until those exist, the placeholder nav at the bottom of this page
// links to URLs that will land on the app/next/[...slug] catch-all
// (the "under construction" page) — honest about what's not yet
// built rather than hiding the gap.
//
// Read-only on this first commit. No client island.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

export default async function AdminLandingPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    // Bounce non-admins to their natural landing page.
    if (profile.role === 'teacher' || profile.role === 'manager') {
      redirect('/tutor/dashboard');
    }
    if (profile.role === 'student') {
      redirect('/dashboard');
    }
    redirect('/');
  }

  // ── Active-user counts via the existing Phase 1 RPC ─────────────
  // count_distinct_users_since lives in the platform_stats migration
  // (create_platform_stats_rpcs.sql) and returns a single integer.
  // It's the fix for the db-max-rows silent-truncation bug that the
  // architecture audit flagged.
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
  ]);

  const activeUsers = {
    today: auToday?.error ? null : auToday?.data ?? null,
    d7: au7?.error ? null : au7?.data ?? null,
    d30: au30?.error ? null : au30?.data ?? null,
  };

  // Tally roles in JS (small dataset, single query).
  const usersByRole = { practice: 0, student: 0, teacher: 0, manager: 0, admin: 0 };
  for (const row of roleCounts ?? []) {
    if (row.role && Object.prototype.hasOwnProperty.call(usersByRole, row.role)) {
      usersByRole[row.role] += 1;
    }
  }
  const totalUsers = Object.values(usersByRole).reduce((acc, n) => acc + n, 0);

  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>
          {profile.first_name ? `Hi, ${profile.first_name}` : 'Admin'}
        </h1>
        <p style={S.sub}>
          Studyworks platform overview. Use the navigation below to drill into
          specific areas.
        </p>
      </header>

      <section>
        <h2 style={S.h2}>Active users</h2>
        <div style={S.statsGrid}>
          <StatCard label="Today" value={activeUsers.today} />
          <StatCard label="Last 7 days" value={activeUsers.d7} />
          <StatCard label="Last 30 days" value={activeUsers.d30} />
        </div>
      </section>

      <section>
        <h2 style={S.h2}>Users by role</h2>
        <div style={S.statsGrid}>
          <StatCard label="Total" value={totalUsers} />
          <StatCard label="Students" value={usersByRole.student} />
          <StatCard label="Practice (unpaid)" value={usersByRole.practice} />
          <StatCard label="Teachers" value={usersByRole.teacher} />
          <StatCard label="Managers" value={usersByRole.manager} />
          <StatCard label="Admins" value={usersByRole.admin} />
        </div>
      </section>

      <section>
        <h2 style={S.h2}>30-day activity</h2>
        <div style={S.statsGrid}>
          <StatCard label="Practice attempts" value={attempts30d ?? 0} />
          <StatCard label="Practice tests completed" value={practiceTests30d ?? 0} />
          <StatCard label="New signups (7 days)" value={recentSignups ?? 0} />
          <StatCard label="Published questions" value={totalQuestions ?? 0} />
        </div>
      </section>

      <section>
        <h2 style={S.h2}>Manage</h2>
        <p style={S.help}>
          The remaining admin sections will land in subsequent Phase 2 commits
          as separate Server Component pages, replacing the seven tabs of the
          legacy AdminDashboard one at a time. Until then, the links below land
          on the &ldquo;under construction&rdquo; placeholder.
        </p>
        <nav style={S.navGrid}>
          <NavCard href="/admin/users" title="User management" desc="Create, edit, and assign users." />
          <NavCard href="/admin/questions" title="Question content" desc="Browse and edit the question bank." />
          <NavCard href="/admin/performance" title="Student performance" desc="Aggregate stats across cohorts." />
          <NavCard href="/admin/teachers" title="Teacher data" desc="Activity and effectiveness." />
          <NavCard href="/admin/questions-v2" title="Questions V2 preview" desc="Approve migrated questions." />
          <NavCard href="/admin/questions-v2/bulk" title="V2 bulk review" desc="Batch approve / fix v2 candidates." />
        </nav>
      </section>
    </main>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={S.cardValue}>{value ?? '—'}</div>
    </div>
  );
}

function NavCard({ href, title, desc }) {
  return (
    <a href={href} style={S.navCard}>
      <div style={S.navTitle}>{title}</div>
      <div style={S.navDesc}>{desc}</div>
    </a>
  );
}

const S = {
  main: { maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  header: { marginBottom: '2rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  h2: {
    fontSize: '1.125rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
    marginTop: '2rem',
  },
  sub: { color: '#4b5563', marginTop: 0 },
  help: { color: '#6b7280', fontSize: '0.9rem', marginTop: 0, marginBottom: '1rem' },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '1rem',
  },
  card: {
    padding: '1rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  cardLabel: { fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' },
  cardValue: { fontSize: '1.5rem', fontWeight: 600, color: '#111827' },
  navGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '0.75rem',
  },
  navCard: {
    display: 'block',
    padding: '1rem',
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    textDecoration: 'none',
    color: 'inherit',
    transition: 'border-color 120ms',
  },
  navTitle: { fontWeight: 600, color: '#111827', marginBottom: '0.25rem' },
  navDesc: { fontSize: '0.85rem', color: '#6b7280' },
};
