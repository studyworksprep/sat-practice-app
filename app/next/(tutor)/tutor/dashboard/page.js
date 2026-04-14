// Tutor dashboard — first Phase 2 page that exercises can_view() /
// list_visible_users() from §3.8 for real.
//
// Lists the tutor's assigned students with basic activity stats.
// Uses the Phase 1 list_visible_users('student') RPC to fetch the
// visible set, then joins with profiles and aggregates attempts in
// JS.  RLS on attempts is already manager-aware via the existing
// fix_manager_practice_test_visibility migration — the query returns
// rows for every student the caller can see, matching the set we
// got from list_visible_users.
//
// Read-only on this first commit — no client island, no Server
// Actions. Sorting / filtering / assignment creation land in follow-
// ups.  Per the Phase 2 pattern: a Server Component is the whole
// file when there's no interactivity.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

const STUDENT_LIMIT = 100;
const ATTEMPT_LIMIT = 20000;

export default async function TutorDashboardPage() {
  const { user, profile, supabase } = await requireUser();

  // Role gate.  Only tutors (teacher/manager role) and admins land
  // here; students get bounced to their own dashboard.
  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // 1) Visible students via the unified hierarchy helper.
  //    list_visible_users is security-definer and returns every user
  //    the caller can see under the can_view() rules from §3.8.
  const { data: visibleRaw, error: rpcErr } = await supabase.rpc(
    'list_visible_users',
    { role_filter: 'student' },
  );

  if (rpcErr) {
    return (
      <ErrorState
        tutorName={profile.first_name ?? user.email}
        message={`Failed to load students: ${rpcErr.message}`}
      />
    );
  }

  const studentIds = (visibleRaw ?? [])
    .map((row) => row.user_id)
    .slice(0, STUDENT_LIMIT);

  if (studentIds.length === 0) {
    return (
      <EmptyState tutorName={profile.first_name ?? user.email} />
    );
  }

  // 2) Profile detail + 3) recent attempts in parallel.
  const [{ data: profiles }, { data: attemptRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, first_name, last_name, target_sat_score, high_school, graduation_year, created_at')
      .in('id', studentIds),
    supabase
      .from('attempts')
      .select('user_id, is_correct, created_at')
      .in('user_id', studentIds)
      .eq('source', 'practice')
      .order('created_at', { ascending: false })
      .limit(ATTEMPT_LIMIT),
  ]);

  // 4) Aggregate attempts per student into a flat map.
  //    Server Component — Date.now() is fine here because the whole
  //    function runs fresh on every request. The react-hooks/purity
  //    rule can't tell Server Components from Client Components so
  //    we silence it on this one line.
  const statsByStudent = {};
  // eslint-disable-next-line react-hooks/purity
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const row of attemptRows ?? []) {
    const s = statsByStudent[row.user_id] || {
      total: 0,
      correct: 0,
      lastAt: null,
      weekTotal: 0,
    };
    s.total += 1;
    if (row.is_correct) s.correct += 1;
    const ts = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (ts > (s.lastAt ? new Date(s.lastAt).getTime() : 0)) {
      s.lastAt = row.created_at;
    }
    if (ts >= weekAgoMs) s.weekTotal += 1;
    statsByStudent[row.user_id] = s;
  }

  // 5) Build the view-model: one row per student, sorted by most
  //    recent activity (desc).  Students with no activity sink to
  //    the bottom.
  const students = (profiles ?? [])
    .map((p) => {
      const s = statsByStudent[p.id] || {
        total: 0,
        correct: 0,
        lastAt: null,
        weekTotal: 0,
      };
      return {
        id: p.id,
        name:
          [p.first_name, p.last_name].filter(Boolean).join(' ') ||
          p.email ||
          '—',
        email: p.email,
        targetScore: p.target_sat_score,
        highSchool: p.high_school,
        graduationYear: p.graduation_year,
        totalAttempts: s.total,
        weekAttempts: s.weekTotal,
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : null,
        lastActivityAt: s.lastAt,
      };
    })
    .sort((a, b) => {
      const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bt - at;
    });

  // 6) Summary stats across the visible cohort.
  const cohort = {
    total: students.length,
    activeThisWeek: students.filter((s) => s.weekAttempts > 0).length,
    totalAttemptsThisWeek: students.reduce((acc, s) => acc + s.weekAttempts, 0),
  };

  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>
          {profile.first_name ? `Hi, ${profile.first_name}` : 'Tutor dashboard'}
        </h1>
        <p style={S.sub}>
          {cohort.total} student{cohort.total === 1 ? '' : 's'} visible ·{' '}
          {cohort.activeThisWeek} active this week ·{' '}
          {cohort.totalAttemptsThisWeek} practice attempts in the last 7 days
        </p>
      </header>

      <section>
        <h2 style={S.h2}>Your students</h2>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Target</th>
                <th style={S.th}>Attempts</th>
                <th style={S.th}>Accuracy</th>
                <th style={S.th}>7-day</th>
                <th style={S.th}>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id}>
                  <td style={S.td}>
                    <div style={S.nameMain}>{s.name}</div>
                    {s.highSchool && (
                      <div style={S.nameSub}>
                        {s.highSchool}
                        {s.graduationYear ? ` · class of ${s.graduationYear}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={S.td}>{s.targetScore ?? '—'}</td>
                  <td style={S.td}>{s.totalAttempts}</td>
                  <td style={S.td}>
                    {s.accuracy != null ? `${s.accuracy}%` : '—'}
                  </td>
                  <td style={S.td}>{s.weekAttempts}</td>
                  <td style={S.td}>{formatRelative(s.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cohort.total >= STUDENT_LIMIT && (
          <p style={S.footnote}>
            Showing the first {STUDENT_LIMIT} students. Filtering and pagination
            arrive in a follow-up.
          </p>
        )}
      </section>
    </main>
  );
}

function EmptyState({ tutorName }) {
  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>{tutorName ? `Hi, ${tutorName}` : 'Tutor dashboard'}</h1>
        <p style={S.sub}>You don&apos;t have any students assigned yet.</p>
      </header>
      <section style={S.emptyCard}>
        <p style={{ margin: 0 }}>
          Your students will appear here once an admin assigns them to you.
          If you expected to see a student already, double-check the
          assignment in the admin panel.
        </p>
      </section>
    </main>
  );
}

function ErrorState({ tutorName, message }) {
  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>{tutorName ? `Hi, ${tutorName}` : 'Tutor dashboard'}</h1>
        <p style={S.sub}>Something went wrong loading your students.</p>
      </header>
      <section style={S.errorCard}>
        <p style={{ margin: 0 }}>{message}</p>
      </section>
    </main>
  );
}

function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

const S = {
  main: { maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  header: { marginBottom: '1.5rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', marginTop: 0 },
  h2: { fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' },
  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.95rem' },
  th: {
    textAlign: 'left',
    padding: '0.625rem 0.75rem',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '0.8rem',
    textTransform: 'uppercase',
    color: '#6b7280',
    letterSpacing: '0.025em',
  },
  td: {
    padding: '0.75rem',
    borderBottom: '1px solid #f3f4f6',
    verticalAlign: 'top',
  },
  nameMain: { fontWeight: 600, color: '#111827' },
  nameSub: { fontSize: '0.8rem', color: '#9ca3af' },
  emptyCard: {
    padding: '1.25rem',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    color: '#4b5563',
  },
  errorCard: {
    padding: '1rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#991b1b',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
  },
  footnote: {
    marginTop: '0.75rem',
    fontSize: '0.85rem',
    color: '#6b7280',
  },
};
