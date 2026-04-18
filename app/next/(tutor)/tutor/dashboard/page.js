// Tutor dashboard — exercises the §3.8 unified hierarchy model.
//
// Queries the student_practice_stats view, which aggregates profile
// fields + attempt stats. RLS on the underlying profiles and attempts
// tables uses can_view(), so the view automatically returns only the
// students the caller is allowed to see.
//
// Read-only on this first commit — no client island, no Server
// Actions. Sorting / filtering / assignment creation land in
// follow-ups. Per the Phase 2 pattern: a Server Component is the
// whole file when there's no interactivity.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

const STUDENT_LIMIT = 100;

export default async function TutorDashboardPage() {
  const { user, profile, supabase } = await requireUser();

  // Role gate. Only tutors (teacher/manager role) and admins land
  // here; students get bounced to their own dashboard.
  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // One query against the student_practice_stats view. RLS on the
  // underlying tables uses can_view(), so visibility is automatic.
  const { data: rows, error: rpcErr } = await supabase
    .from('student_practice_stats')
    .select('*')
    .order('last_activity_at', { ascending: false, nullsFirst: false });

  if (rpcErr) {
    return (
      <ErrorState
        tutorName={profile.first_name ?? user.email}
        message={`Failed to load students: ${rpcErr.message}`}
      />
    );
  }

  const rawStudents = rows ?? [];
  if (rawStudents.length === 0) {
    return (
      <EmptyState tutorName={profile.first_name ?? user.email} />
    );
  }

  // Map the view rows to the view-model the table renders.
  const students = rawStudents.slice(0, STUDENT_LIMIT).map((row) => ({
    id: row.user_id,
    name:
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.email ||
      '—',
    email: row.email,
    targetScore: row.target_sat_score,
    highSchool: row.high_school,
    graduationYear: row.graduation_year,
    totalAttempts: Number(row.total_attempts ?? 0),
    weekAttempts: Number(row.week_attempts ?? 0),
    accuracy:
      Number(row.total_attempts ?? 0) > 0
        ? Math.round(
            (Number(row.correct_attempts ?? 0) /
              Number(row.total_attempts ?? 0)) *
              100,
          )
        : null,
    lastActivityAt: row.last_activity_at,
  }));

  // Cohort summary.
  const cohort = {
    total: students.length,
    visible: rawStudents.length,
    activeThisWeek: students.filter((s) => s.weekAttempts > 0).length,
    totalAttemptsThisWeek: students.reduce((acc, s) => acc + s.weekAttempts, 0),
  };

  return (
    <main style={S.main}>
      <header style={S.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={S.h1}>
              {profile.first_name ? `Hi, ${profile.first_name}` : 'Tutor dashboard'}
            </h1>
            <p style={S.sub}>
              {cohort.total} student{cohort.total === 1 ? '' : 's'} visible ·{' '}
              {cohort.activeThisWeek} active this week ·{' '}
              {cohort.totalAttemptsThisWeek} practice attempts in the last 7 days
            </p>
          </div>
          <a
            href="/tutor/assignments"
            style={{
              padding: '0.5rem 1rem', background: '#2563eb', color: 'white',
              borderRadius: 6, textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600,
            }}
          >
            Assignments
          </a>
        </div>
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
                    <a href={`/tutor/students/${s.id}`} style={S.nameLink}>
                      <div style={S.nameMain}>{s.name}</div>
                    </a>
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
        {cohort.visible > STUDENT_LIMIT && (
          <p style={S.footnote}>
            Showing the first {STUDENT_LIMIT} of {cohort.visible} students.
            Filtering and pagination arrive in a follow-up.
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
  nameLink: { textDecoration: 'none', color: 'inherit' },
  nameMain: { fontWeight: 600, color: '#2563eb' },
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
