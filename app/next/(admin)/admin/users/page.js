// Admin users tab — second carve-out from the legacy 2,366-line
// AdminDashboard.js. See docs/architecture-plan.md §3.4 and Phase 2
// in §4.
//
// Read-only on this first commit: list of users with search by
// email/name + role filter + recent signups. Editing roles,
// creating users, and assigning users land in follow-up commits.
//
// URL query params drive the filter: ?role=student, ?q=alice, etc.
// The client island is a tiny form that just submits the params via
// <form action> and lets the Server Component do the heavy lifting.
// No client-side fetching.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { UsersFilter } from './UsersFilter';

export const dynamic = 'force-dynamic';

const USER_LIMIT = 200;

export default async function AdminUsersPage({ searchParams }) {
  const sp = (await searchParams) ?? {};
  const roleFilter = typeof sp.role === 'string' ? sp.role : '';
  const query = typeof sp.q === 'string' ? sp.q.trim() : '';

  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  // Build the profiles query. Admin RLS on profiles allows viewing
  // all rows, so this is a plain select. No RPC needed — the admin
  // is the one tier of the hierarchy that doesn't need can_view().
  let q = supabase
    .from('profiles')
    .select(
      'id, email, first_name, last_name, role, high_school, graduation_year, created_at, is_active, subscription_exempt, target_sat_score',
    )
    .order('created_at', { ascending: false })
    .limit(USER_LIMIT);

  if (roleFilter && roleFilter !== 'all') {
    q = q.eq('role', roleFilter);
  }

  if (query) {
    // Supabase/PostgREST OR syntax for multi-column ILIKE. Wraps
    // the query in % so it's a substring match.
    const like = `%${query.replace(/[,()]/g, ' ')}%`;
    q = q.or(
      `email.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`,
    );
  }

  const { data: users, error } = await q;

  if (error) {
    return (
      <ErrorState message={`Failed to load users: ${error.message}`} />
    );
  }

  const rows = users ?? [];

  // Role counts for the filter-bar summary. Separate from the
  // filtered query so the counts don't shrink when the user picks
  // a role filter. Admins care about the overall distribution.
  const { data: allRoles } = await supabase
    .from('profiles')
    .select('role')
    .limit(50000);

  const roleTally = { practice: 0, student: 0, teacher: 0, manager: 0, admin: 0 };
  for (const r of allRoles ?? []) {
    if (r.role && Object.prototype.hasOwnProperty.call(roleTally, r.role)) {
      roleTally[r.role] += 1;
    }
  }

  return (
    <main style={S.main}>
      <nav style={S.breadcrumb}>
        <a href="/admin" style={S.breadcrumbLink}>← Admin</a>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>User management</h1>
        <p style={S.sub}>
          Browse platform users, filter by role, search by name or email.
          Editing roles and creating users land in follow-up commits.
        </p>
      </header>

      <section style={S.filterSection}>
        <UsersFilter currentRole={roleFilter} currentQuery={query} roleTally={roleTally} />
      </section>

      <section>
        <h2 style={S.h2}>
          {rows.length} result{rows.length === 1 ? '' : 's'}
          {rows.length >= USER_LIMIT && ` (first ${USER_LIMIT})`}
        </h2>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Name</th>
                <th style={S.th}>Email</th>
                <th style={S.th}>Role</th>
                <th style={S.th}>School</th>
                <th style={S.th}>Created</th>
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const name =
                  [u.first_name, u.last_name].filter(Boolean).join(' ') || '—';
                return (
                  <tr key={u.id}>
                    <td style={S.td}>{name}</td>
                    <td style={S.td}>{u.email ?? '—'}</td>
                    <td style={S.td}>
                      <span style={{ ...S.roleTag, ...roleTagColor(u.role) }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={S.td}>
                      {u.high_school ? (
                        <>
                          {u.high_school}
                          {u.graduation_year ? ` (${u.graduation_year})` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={S.td}>{formatDate(u.created_at)}</td>
                    <td style={S.td}>
                      {!u.is_active ? (
                        <span style={S.inactive}>Inactive</span>
                      ) : u.subscription_exempt ? (
                        <span style={S.exempt}>Exempt</span>
                      ) : (
                        <span style={S.active}>Active</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={S.emptyRow}>
                    No users match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function ErrorState({ message }) {
  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>User management</h1>
      </header>
      <section style={S.errorCard}>
        <p style={{ margin: 0 }}>{message}</p>
      </section>
    </main>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function roleTagColor(role) {
  switch (role) {
    case 'admin':
      return { background: '#fef3c7', color: '#92400e' };
    case 'manager':
      return { background: '#ede9fe', color: '#5b21b6' };
    case 'teacher':
      return { background: '#dbeafe', color: '#1d4ed8' };
    case 'student':
      return { background: '#dcfce7', color: '#166534' };
    default:
      return { background: '#f3f4f6', color: '#6b7280' };
  }
}

const S = {
  main: { maxWidth: 1200, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  breadcrumb: { marginBottom: '1rem' },
  breadcrumbLink: { color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' },
  header: { marginBottom: '1.5rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', marginTop: 0 },
  filterSection: { marginBottom: '1.5rem' },
  h2: { fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: '#374151' },
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
  roleTag: {
    display: 'inline-block',
    padding: '0.125rem 0.5rem',
    borderRadius: 999,
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  active: { color: '#166534', fontSize: '0.8rem' },
  inactive: { color: '#991b1b', fontSize: '0.8rem' },
  exempt: { color: '#92400e', fontSize: '0.8rem' },
  emptyRow: { padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' },
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
