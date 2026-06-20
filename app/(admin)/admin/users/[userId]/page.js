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
import { Card } from '@/lib/ui/Card';
import { RoleTag } from '@/lib/ui/RoleTag';
import { StatusBadge } from '@/lib/ui/StatusBadge';
import { SubscriptionBadge } from '@/lib/ui/SubscriptionBadge';
import { UserEditForm } from './UserEditForm';
import { RoleChanger } from './RoleChanger';
import { StatusActions } from './StatusActions';
import { Relationships } from './Relationships';
import a from '../../../admin.module.css';

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
      'id, email, first_name, last_name, role, is_active, banned_at, subscription_exempt, target_sat_score, high_school, graduation_year, tutor_name, sat_test_date, created_at',
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) return <ErrorState message={`Failed to load user: ${error.message}`} />;
  if (!subject) notFound();

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .maybeSingle();

  const displayName = [subject.first_name, subject.last_name].filter(Boolean).join(' ') || subject.email || subject.id;
  const isSelf = subject.id === user.id;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
        {' · '}
        <a href="/admin/users">Users</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · User</div>
        <h1 className={a.h1}>{displayName}</h1>
        <div style={S.subRow}>
          <RoleTag role={subject.role} />
          <StatusBadge
            active={subject.is_active !== false}
            banned={subject.banned_at != null}
          />
          <SubscriptionBadge
            exempt={subject.subscription_exempt}
            subscription={subscription ?? null}
          />
          {subject.email && <span style={S.email}>{subject.email}</span>}
          <span style={S.muted}>Joined {formatDate(subject.created_at) || '—'}</span>
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
          isBanned={subject.banned_at != null}
          isSelf={isSelf}
        />
      </Section>
    </main>
  );
}

function Section({ title, tone, children }) {
  // Use the shared admin .section card and override only when the
  // section is dangerous (status & deletion).
  const sectionStyle = tone === 'danger'
    ? { borderColor: 'var(--color-danger)' }
    : undefined;
  const titleColor = tone === 'danger' ? 'var(--color-diff-hard-fg)' : undefined;
  return (
    <section className={a.section} style={sectionStyle}>
      <h2 className={a.h2} style={titleColor ? { color: titleColor } : undefined}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function ErrorState({ message }) {
  return (
    <main className={a.container}>
      <header className={a.header}>
        <div className={a.eyebrow}>Admin · User</div>
        <h1 className={a.h1}>User detail</h1>
      </header>
      <Card tone="danger" style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        <p style={{ margin: 0 }}>{message}</p>
      </Card>
    </main>
  );
}


// Page chrome (container / header / sections) comes from
// admin.module.css; role + status pills from shared RoleTag /
// StatusBadge primitives. Only the per-row meta layout is
// unique to this page.
const S = {
  subRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
    fontSize: 13,
  },
  email: { color: 'var(--fg2)' },
  muted: { color: 'var(--fg3)' },
};
