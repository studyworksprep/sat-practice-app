// Admin users — list page. Browse, search, filter; click a name
// to open the detail page where editing happens. Bulk relationship
// wiring is at /admin/users/relationships; signup codes at
// /admin/users/codes.
//
// URL query params drive the filter: ?role=student, ?q=alice, etc.
// The client island (UsersFilter) is a tiny form that submits the
// params via <form method="GET">; the Server Component re-runs with
// the new filter. No client-side fetching.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Card } from '@/lib/ui/Card';
import { Table, Th, Td } from '@/lib/ui/Table';
import { UsersFilter } from './UsersFilter';
import { UsersNav } from './UsersNav';

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
          Browse and edit platform users. Click a name to open their detail
          page. Use Relationships for bulk assignments and Codes for
          signup/invite tokens.
        </p>
      </header>

      <UsersNav current="list" />

      <section style={S.filterSection}>
        <UsersFilter currentRole={roleFilter} currentQuery={query} roleTally={roleTally} />
      </section>

      <section>
        <h2 style={S.h2}>
          {rows.length} result{rows.length === 1 ? '' : 's'}
          {rows.length >= USER_LIMIT && ` (first ${USER_LIMIT})`}
        </h2>
        <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>School</Th>
                <Th>Created</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const name =
                  [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || '—';
                return (
                  <tr key={u.id}>
                    <Td>
                      <a href={`/admin/users/${u.id}`} style={S.nameLink}>{name}</a>
                    </Td>
                    <Td>{u.email ?? '—'}</Td>
                    <Td>
                      <span style={{ ...S.roleTag, ...roleTagColor(u.role) }}>
                        {u.role}
                      </span>
                    </Td>
                    <Td>
                      {u.high_school ? (
                        <>
                          {u.high_school}
                          {u.graduation_year ? ` (${u.graduation_year})` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>{formatDate(u.created_at) || '—'}</Td>
                    <Td>
                      {!u.is_active ? (
                        <span style={S.inactive}>Inactive</span>
                      ) : u.subscription_exempt ? (
                        <span style={S.exempt}>Exempt</span>
                      ) : (
                        <span style={S.active}>Active</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <Td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                    No users match those filters.
                  </Td>
                </tr>
              )}
            </tbody>
        </Table>
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
      <Card tone="danger" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
        <p style={{ margin: 0 }}>{message}</p>
      </Card>
    </main>
  );
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
  nameLink: { color: '#2563eb', fontWeight: 600, textDecoration: 'none' },
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
};
