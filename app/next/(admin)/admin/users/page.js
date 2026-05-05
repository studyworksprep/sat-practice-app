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
      'id, email, first_name, last_name, role, high_school, graduation_year, created_at, is_active, subscription_exempt, target_sat_score, ui_version',
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

  // Role + tree counts for the filter-bar summary. Separate from
  // the filtered query so the counts don't shrink when the user
  // picks a role filter. Admins care about the overall distribution
  // and the legacy-vs-next migration progress.
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('role, ui_version')
    .limit(50000);

  const roleTally = { practice: 0, student: 0, teacher: 0, manager: 0, admin: 0 };
  const treeTally = { next: 0, legacy: 0 };
  for (const r of allUsers ?? []) {
    if (r.role && Object.prototype.hasOwnProperty.call(roleTally, r.role)) {
      roleTally[r.role] += 1;
    }
    // Null ui_version → legacy by default (matches proxy.js fallback).
    treeTally[r.ui_version === 'next' ? 'next' : 'legacy'] += 1;
  }
  const totalUsers = treeTally.next + treeTally.legacy;
  const nextPct = totalUsers > 0
    ? Math.round((treeTally.next / totalUsers) * 100)
    : 0;

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

      {/* Tree-distribution strip — quick at-a-glance count of how
          many users are on the new tree vs still on legacy. Non-
          interactive; the per-row Tree column below is the
          drill-in. Default is legacy (matches proxy.js fallback)
          so any null ui_version falls into that bucket. */}
      <section style={S.treeStrip}>
        <div style={S.treeChip}>
          <span style={S.treeChipDot('next')} />
          <span style={S.treeChipLabel}>Next</span>
          <span style={S.treeChipValue}>{treeTally.next.toLocaleString()}</span>
        </div>
        <div style={S.treeChip}>
          <span style={S.treeChipDot('legacy')} />
          <span style={S.treeChipLabel}>Legacy</span>
          <span style={S.treeChipValue}>{treeTally.legacy.toLocaleString()}</span>
        </div>
        <div style={S.treeChipMeta}>
          {totalUsers === 0
            ? 'No users yet'
            : `${nextPct}% on the new tree · ${treeTally.legacy.toLocaleString()} still to migrate`}
        </div>
      </section>

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
                <Th>Tree</Th>
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
                      <RoleTag role={u.role} />
                    </Td>
                    <Td>
                      <TreeBadge value={u.ui_version} />
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
                        exempt={u.subscription_exempt}
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


// Per-user tree indicator. Null ui_version is treated as legacy
// to match proxy.js's fallback resolution.
function TreeBadge({ value }) {
  const isNext = value === 'next';
  return (
    <span style={isNext ? S.treeBadgeNext : S.treeBadgeLegacy}>
      {isNext ? 'Next' : 'Legacy'}
    </span>
  );
}

// Inline-row styles. Page chrome (container / header / sections)
// comes from admin.module.css; role + status pills come from
// shared RoleTag / StatusBadge primitives. Tree-distribution
// strip + per-row Tree badge live here since they're a one-page
// concern that doesn't justify a shared primitive yet.
const S = {
  nameLink: {
    color: 'var(--color-app-accent)',
    fontWeight: 600,
    textDecoration: 'none',
  },
  treeStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '12px 16px',
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md, 8px)',
    marginBottom: '12px',
  },
  treeChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 12px',
    background: 'var(--bg-white, #fff)',
    border: '1px solid var(--border)',
    borderRadius: '999px',
    fontSize: 13,
  },
  treeChipDot: (kind) => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: kind === 'next' ? '#0284c7' : '#94a3b8',
    flex: '0 0 auto',
  }),
  treeChipLabel: {
    color: 'var(--fg2)',
    fontWeight: 600,
    textTransform: 'uppercase',
    fontSize: 11,
    letterSpacing: '0.04em',
  },
  treeChipValue: {
    color: 'var(--fg1)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },
  treeChipMeta: {
    marginLeft: 'auto',
    fontSize: 12,
    color: 'var(--fg2)',
  },
  treeBadgeNext: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#e0f2fe',
    color: '#0369a1',
    border: '1px solid #7dd3fc',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  treeBadgeLegacy: {
    display: 'inline-block',
    padding: '2px 8px',
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #cbd5e1',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
};
