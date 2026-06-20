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
import { RoleTag } from '@/lib/ui/RoleTag';
import { StatusBadge } from '@/lib/ui/StatusBadge';
import { SubscriptionBadge } from '@/lib/ui/SubscriptionBadge';
import { Table, Th, Td } from '@/lib/ui/Table';
import { UsersFilter } from './UsersFilter';
import { UsersNav } from './UsersNav';
import a from '../../admin.module.css';

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
      'id, email, first_name, last_name, role, high_school, graduation_year, created_at, is_active, banned_at, subscription_exempt, target_sat_score',
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

  // Role counts for the filter-bar summary. Independent of the
  // filtered list, so fire them in parallel with it. head:true
  // count:'exact' returns counts only — no row payload.
  const countRole = (role) =>
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role);

  const [
    usersResult,
    studentCountResult,
    teacherCountResult,
    managerCountResult,
    adminCountResult,
    practiceCountResult,
  ] = await Promise.all([
    q,
    countRole('student'),
    countRole('teacher'),
    countRole('manager'),
    countRole('admin'),
    countRole('practice'),
  ]);

  const { data: users, error } = usersResult;

  if (error) {
    return (
      <ErrorState message={`Failed to load users: ${error.message}`} />
    );
  }

  const rows = users ?? [];

  // Pull subscription rows for the visible profiles in one round-trip.
  // The subscriptions table has a unique constraint on user_id, so the
  // lookup is 1:1. Plan + status drive the diagnostic Subscription
  // column below; profile.role is intentionally not consulted there.
  const subsByUser = new Map();
  if (rows.length > 0) {
    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, plan, status')
      .in('user_id', rows.map((r) => r.id));
    for (const s of subs ?? []) subsByUser.set(s.user_id, s);
  }

  const roleTally = {
    practice: practiceCountResult.count ?? 0,
    student: studentCountResult.count ?? 0,
    teacher: teacherCountResult.count ?? 0,
    manager: managerCountResult.count ?? 0,
    admin: adminCountResult.count ?? 0,
  };

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Users</div>
        <h1 className={a.h1}>User management</h1>
        <p className={a.sub}>
          Browse and edit platform users. Click a name to open their detail
          page. Use Relationships for bulk assignments and Codes for
          signup/invite tokens.
        </p>
      </header>

      <UsersNav current="list" />

      <section>
        <UsersFilter currentRole={roleFilter} currentQuery={query} roleTally={roleTally} />
      </section>

      <section className={a.section}>
        <div className={a.sectionLabel}>
          {rows.length} result{rows.length === 1 ? '' : 's'}
          {rows.length >= USER_LIMIT && ` (first ${USER_LIMIT})`}
        </div>
        <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>School</Th>
                <Th>Created</Th>
                <Th>Status</Th>
                <Th>Subscription</Th>
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
                      <RoleTag role={u.role} />
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
                      <StatusBadge
                        active={u.is_active !== false}
                        banned={u.banned_at != null}
                      />
                    </Td>
                    <Td>
                      <SubscriptionBadge
                        exempt={u.subscription_exempt}
                        subscription={subsByUser.get(u.id) ?? null}
                      />
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <Td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
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
    <main className={a.container}>
      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Users</div>
        <h1 className={a.h1}>User management</h1>
      </header>
      <Card tone="danger" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        <p style={{ margin: 0 }}>{message}</p>
      </Card>
    </main>
  );
}

const S = {
  nameLink: {
    color: 'var(--color-app-accent)',
    fontWeight: 600,
    textDecoration: 'none',
  },
};
