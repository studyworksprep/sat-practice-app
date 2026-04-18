// Admin user detail page. The "everything about this person" view:
// editable profile fields, role change (with admin-promotion confirm),
// status (deactivate/reactivate), full deletion (clean up bad
// accounts), and the role-appropriate relationships.
//
// Server Component shell; small client islands handle form
// interactivity. RLS on profiles uses can_view(); admin sees all.

import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { UserEditForm } from './UserEditForm';
import { RoleChanger } from './RoleChanger';
import { StatusActions } from './StatusActions';
import { Relationships } from './Relationships';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({ params }) {
  const { userId } = await params;
  const { user, profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const { data: subject, error } = await supabase
    .from('profiles')
    .select(
      'id, email, first_name, last_name, role, is_active, subscription_exempt, target_sat_score, high_school, graduation_year, tutor_name, sat_test_date, created_at, ui_version',
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) return <ErrorState message={`Failed to load user: ${error.message}`} />;
  if (!subject) notFound();

  const displayName = [subject.first_name, subject.last_name].filter(Boolean).join(' ') || subject.email || subject.id;
  const isSelf = subject.id === user.id;

  return (
    <main style={S.main}>
      <nav style={S.breadcrumb}>
        <a href="/admin" style={S.crumbLink}>← Admin</a>
        {' · '}
        <a href="/admin/users" style={S.crumbLink}>Users</a>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>{displayName}</h1>
        <div style={S.subRow}>
          <span style={{ ...S.roleTag, ...roleColor(subject.role) }}>{subject.role}</span>
          <StatusBadge active={subject.is_active} exempt={subject.subscription_exempt} />
          {subject.email && <span style={S.email}>{subject.email}</span>}
          <span style={S.muted}>Joined {formatDate(subject.created_at) || '—'}</span>
          <span style={S.muted}>UI: {subject.ui_version ?? 'legacy'}</span>
        </div>
      </header>

      <Section title="Profile">
        <UserEditForm
          userId={subject.id}
          initial={{
            first_name: subject.first_name,
            last_name: subject.last_name,
            email: subject.email,
            tutor_name: subject.tutor_name,
            high_school: subject.high_school,
            graduation_year: subject.graduation_year,
            target_sat_score: subject.target_sat_score,
          }}
        />
      </Section>

      <Section title="Role">
        <RoleChanger userId={subject.id} currentRole={subject.role} />
      </Section>

      <Section title="Relationships">
        <Relationships supabase={supabase} subject={subject} />
      </Section>

      <Section title="Status & deletion" tone="danger">
        <StatusActions
          userId={subject.id}
          isActive={subject.is_active !== false}
          isSelf={isSelf}
        />
      </Section>
    </main>
  );
}

function Section({ title, tone, children }) {
  const style = tone === 'danger'
    ? { ...S.section, borderColor: '#fecaca' }
    : S.section;
  return (
    <section style={style}>
      <h2 style={tone === 'danger' ? S.h2Danger : S.h2}>{title}</h2>
      {children}
    </section>
  );
}

function StatusBadge({ active, exempt }) {
  if (active === false) return <span style={S.badgeInactive}>Inactive</span>;
  if (exempt) return <span style={S.badgeExempt}>Exempt</span>;
  return <span style={S.badgeActive}>Active</span>;
}

function ErrorState({ message }) {
  return (
    <main style={S.main}>
      <header style={S.header}>
        <h1 style={S.h1}>User detail</h1>
      </header>
      <section style={S.errorCard}>
        <p style={{ margin: 0 }}>{message}</p>
      </section>
    </main>
  );
}


function roleColor(role) {
  switch (role) {
    case 'admin':   return { background: '#fef3c7', color: '#92400e' };
    case 'manager': return { background: '#ede9fe', color: '#5b21b6' };
    case 'teacher': return { background: '#dbeafe', color: '#1d4ed8' };
    case 'student': return { background: '#dcfce7', color: '#166534' };
    default:        return { background: '#f3f4f6', color: '#6b7280' };
  }
}

const S = {
  main: { maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  breadcrumb: { marginBottom: '1rem', fontSize: '0.85rem', color: '#6b7280' },
  crumbLink: { color: '#2563eb', textDecoration: 'none' },
  header: { marginBottom: '2rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' },
  subRow: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', fontSize: '0.85rem' },
  email: { color: '#4b5563' },
  muted: { color: '#9ca3af' },
  roleTag: { display: 'inline-block', padding: '0.125rem 0.6rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600 },
  badgeActive:   { padding: '0.125rem 0.6rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, background: '#dcfce7', color: '#166534' },
  badgeInactive: { padding: '0.125rem 0.6rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, background: '#fee2e2', color: '#991b1b' },
  badgeExempt:   { padding: '0.125rem 0.6rem', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, background: '#fef3c7', color: '#92400e' },
  section: { marginBottom: '1.5rem', padding: '1.25rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 },
  h2: { fontSize: '1rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem', color: '#111827' },
  h2Danger: { fontSize: '1rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem', color: '#991b1b' },
  errorCard: { padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontFamily: 'monospace', fontSize: '0.9rem' },
};
