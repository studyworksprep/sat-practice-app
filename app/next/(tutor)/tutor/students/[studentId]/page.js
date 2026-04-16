// Tutor → individual student detail page. See docs/architecture-plan.md §3.8.
//
// Called from the tutor dashboard via a "View" link on each row.
// Shows the student's profile + practice stats + recent attempt
// history. Two plain queries:
//   1) student_practice_stats view — profile + aggregated stats
//   2) attempts table — last N individual attempts
//
// RLS on the underlying tables uses can_view(), so visibility is
// automatic. If the caller can't see the student, both return
// empty and the page 404s.
//
// Read-only on this first commit. Mutations (assigning work,
// messaging, editing) land in follow-up commits.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

const RECENT_ATTEMPTS_LIMIT = 50;

export default async function TutorStudentDetailPage({ params }) {
  const { studentId } = await params;
  const { profile, supabase } = await requireUser();

  // Role gate — tutors, managers, admins only.
  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // 1) Load profile + stats and 2) recent attempts in parallel.
  //    RLS uses can_view() on both underlying tables.
  //    Empty result on #1 → caller can't see this student → 404.
  const [
    { data: studentRows, error: rpcErr },
    { data: attemptRows, error: attemptsErr },
  ] = await Promise.all([
    supabase
      .from('student_practice_stats')
      .select('*')
      .eq('user_id', studentId),
    supabase
      .from('attempts')
      .select('id, question_id, is_correct, selected_option_id, response_text, time_spent_ms, source, created_at')
      .eq('user_id', studentId)
      .order('created_at', { ascending: false })
      .limit(RECENT_ATTEMPTS_LIMIT),
  ]);

  if (rpcErr) {
    return (
      <ErrorState message={`Failed to load student: ${rpcErr.message}`} />
    );
  }
  if (!studentRows || studentRows.length === 0) {
    notFound();
  }

  const row = studentRows[0];
  const student = {
    id: row.user_id,
    name:
      [row.first_name, row.last_name].filter(Boolean).join(' ') ||
      row.email ||
      'Unknown',
    email: row.email,
    targetScore: row.target_sat_score,
    highSchool: row.high_school,
    graduationYear: row.graduation_year,
    satTestDate: row.sat_test_date,
    totalAttempts: Number(row.total_attempts ?? 0),
    correctAttempts: Number(row.correct_attempts ?? 0),
    weekAttempts: Number(row.week_attempts ?? 0),
    accuracy:
      Number(row.total_attempts ?? 0) > 0
        ? Math.round(
            (Number(row.correct_attempts ?? 0) / Number(row.total_attempts ?? 0)) * 100,
          )
        : null,
    lastActivityAt: row.last_activity_at,
  };

  const recentAttempts = attemptsErr ? [] : (attemptRows ?? []);

  return (
    <main style={S.main}>
      <nav style={S.breadcrumb}>
        <a href="/tutor/dashboard" style={S.breadcrumbLink}>
          ← Tutor dashboard
        </a>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>{student.name}</h1>
        <div style={S.sub}>
          {student.email}
          {student.highSchool && (
            <span>
              {' · '}
              {student.highSchool}
              {student.graduationYear ? ` · class of ${student.graduationYear}` : ''}
            </span>
          )}
        </div>
      </header>

      <section>
        <h2 style={S.h2}>Stats</h2>
        <div style={S.statsGrid}>
          <StatCard label="Target SAT score" value={student.targetScore ?? '—'} />
          <StatCard label="Total attempts" value={student.totalAttempts} />
          <StatCard
            label="Accuracy"
            value={student.accuracy != null ? `${student.accuracy}%` : '—'}
          />
          <StatCard label="Last 7 days" value={student.weekAttempts} />
          <StatCard label="Last activity" value={formatRelative(student.lastActivityAt)} small />
          {student.satTestDate && (
            <StatCard
              label="Test date"
              value={new Date(student.satTestDate).toLocaleDateString()}
              small
            />
          )}
        </div>
      </section>

      <section>
        <h2 style={S.h2}>Recent attempts</h2>
        {(!recentAttempts || recentAttempts.length === 0) ? (
          <p style={S.empty}>No attempts yet.</p>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>When</th>
                  <th style={S.th}>Source</th>
                  <th style={S.th}>Result</th>
                  <th style={S.th}>Time</th>
                  <th style={S.th}>Question</th>
                </tr>
              </thead>
              <tbody>
                {recentAttempts.map((a) => (
                  <tr key={a.id}>
                    <td style={S.td}>{formatRelative(a.created_at)}</td>
                    <td style={S.td}>{a.source}</td>
                    <td style={{ ...S.td, color: a.is_correct ? '#166534' : '#991b1b' }}>
                      {a.is_correct ? '✓ Correct' : '✗ Incorrect'}
                    </td>
                    <td style={S.td}>
                      {a.time_spent_ms != null ? `${Math.round(a.time_spent_ms / 1000)}s` : '—'}
                    </td>
                    <td style={S.tdCode}>
                      <code>{a.question_id.slice(0, 8)}…</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value, small = false }) {
  return (
    <div style={S.card}>
      <div style={S.cardLabel}>{label}</div>
      <div style={small ? S.cardValueSmall : S.cardValue}>{value ?? '—'}</div>
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>Student detail</h1>
        <p style={S.sub}>Something went wrong loading this student.</p>
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
  breadcrumb: { marginBottom: '1rem' },
  breadcrumbLink: { color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' },
  header: { marginBottom: '2rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', fontSize: '0.95rem' },
  h2: { fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem', marginTop: '1.5rem' },
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
  cardValueSmall: { fontSize: '1rem', fontWeight: 500, color: '#374151' },
  empty: { color: '#9ca3af', fontStyle: 'italic' },
  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    background: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    color: '#6b7280',
    letterSpacing: '0.025em',
  },
  td: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6' },
  tdCode: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' },
  errorCard: {
    padding: '1rem',
    background: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: 8,
    color: '#991b1b',
    fontFamily: 'monospace',
    fontSize: '0.9rem',
  },
};
