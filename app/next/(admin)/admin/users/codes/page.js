// Admin users → Codes. Two operational tools:
//
// - Teacher Codes: bulk admin-created signup tokens. Anyone signing
//   up with one becomes a teacher.
// - Teacher Invite Codes: a per-teacher personal code students can
//   use during signup to auto-assign to that teacher.
//
// Server Component shell. Forms post directly to Server Actions.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { UsersNav } from '../UsersNav';
import {
  createTeacherCode,
  revokeTeacherCode,
  setTeacherInviteCode,
  clearTeacherInviteCode,
} from './actions';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

export const dynamic = 'force-dynamic';

export default async function AdminUserCodesPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  const [{ data: codes }, { data: teachers }] = await Promise.all([
    supabase
      .from('teacher_codes')
      .select('id, code, used_by, used_at, created_at, used_by_profile:profiles!teacher_codes_used_by_fkey(id, first_name, last_name, email)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email, teacher_invite_code')
      .in('role', ['teacher', 'manager', 'admin'])
      .order('email')
      .limit(1000),
  ]);

  const codesAvailable = (codes ?? []).filter((c) => !c.used_by).length;
  const codesUsed = (codes ?? []).length - codesAvailable;
  const teachersWithCodes = (teachers ?? []).filter((t) => t.teacher_invite_code).length;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Codes</div>
        <h1 className={a.h1}>Signup codes</h1>
        <p className={a.sub}>
          Teacher Codes are bulk admin-created tokens (consumed at signup).
          Teacher Invite Codes are per-teacher personal codes students enter
          during signup to auto-assign to that teacher.
        </p>
      </header>

      <UsersNav current="codes" />

      <Section title={`Teacher Codes (${codesAvailable} available · ${codesUsed} used)`}>
        <form action={createTeacherCode} className={f.row}>
          <label className={f.label}>
            <span className={f.labelText}>New code</span>
            <input
              name="code"
              type="text"
              placeholder="Leave blank to auto-generate"
              className={f.input}
              style={{ textTransform: 'uppercase', minWidth: 220 }}
            />
          </label>
          <Button type="submit" variant="primary" size="sm">Create</Button>
        </form>

        {(codes ?? []).length === 0 ? (
          <p className={f.empty}>No teacher codes yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Status</Th>
                <Th>Used by</Th>
                <Th>Created</Th>
                <Th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {(codes ?? []).map((c) => (
                <tr key={c.id}>
                  <Td style={S.code}>{c.code}</Td>
                  <Td>
                    {c.used_by ? (
                      <span style={{ ...S.statusPill, ...S.statusUsed }}>Used</span>
                    ) : (
                      <span style={{ ...S.statusPill, ...S.statusAvail }}>Available</span>
                    )}
                  </Td>
                  <Td>
                    {c.used_by ? (
                      <a href={`/admin/users/${c.used_by}`} style={S.userLink}>
                        {displayName(c.used_by_profile)
                          || c.used_by_profile?.email
                          || c.used_by.slice(0, 8)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td style={{ color: 'var(--fg3)', fontSize: 12 }}>
                    {formatDate(c.created_at) || '—'}
                  </Td>
                  <Td>
                    <form action={revokeTeacherCode}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="remove" size="sm">Revoke</Button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      <Section title={`Teacher Invite Codes (${teachersWithCodes} of ${teachers?.length ?? 0} teachers have a code)`}>
        <p className={f.formHint}>
          Each teacher can have one invite code. Generate a fresh one by
          submitting an empty value.
        </p>

        <Table>
          <thead>
            <tr>
              <Th>Teacher</Th>
              <Th>Current code</Th>
              <Th>Set / regenerate</Th>
              <Th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {(teachers ?? []).map((t) => (
              <tr key={t.id}>
                <Td>
                  <a href={`/admin/users/${t.id}`} style={S.userLink}>
                    {displayName(t) || t.email}
                  </a>
                </Td>
                <Td style={S.code}>
                  {t.teacher_invite_code ?? (
                    <span style={{ color: 'var(--fg3)' }}>—</span>
                  )}
                </Td>
                <Td>
                  <form action={setTeacherInviteCode} style={S.inlineForm}>
                    <input type="hidden" name="teacher_id" value={t.id} />
                    <input
                      name="code"
                      type="text"
                      placeholder={t.teacher_invite_code
                        ? 'New code or blank to rotate'
                        : 'Code or blank for auto'}
                      className={f.input}
                      style={{ textTransform: 'uppercase', fontSize: 12, maxWidth: 200 }}
                    />
                    <Button type="submit" variant="primary" size="sm">
                      {t.teacher_invite_code ? 'Change' : 'Generate'}
                    </Button>
                  </form>
                </Td>
                <Td>
                  {t.teacher_invite_code && (
                    <form action={clearTeacherInviteCode}>
                      <input type="hidden" name="teacher_id" value={t.id} />
                      <Button type="submit" variant="remove" size="sm">Clear</Button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
            {(teachers ?? []).length === 0 && (
              <tr>
                <Td colSpan={4} className={f.empty}>No teachers found.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Section>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className={a.section}>
      <h2 className={a.h2}>{title}</h2>
      {children}
    </section>
  );
}

function displayName(p) {
  if (!p) return null;
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}


// Page chrome (container/header/section) comes from
// admin.module.css; form bits from forms.module.css. Only the
// per-cell code/link/status-pill styles are unique here.
const S = {
  inlineForm: { display: 'flex', gap: 6, alignItems: 'center' },
  code: {
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: 'var(--color-navy-900)',
  },
  userLink: { color: 'var(--color-app-accent)', textDecoration: 'none', fontWeight: 600 },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    border: '1px solid var(--border)',
  },
  statusAvail: {
    background: 'var(--color-success-bg)',
    color: 'var(--color-diff-easy-fg)',
    borderColor: 'var(--color-success)',
  },
  statusUsed: {
    background: 'var(--color-slate-100)',
    color: 'var(--fg3)',
    borderColor: 'var(--border-strong)',
  },
};
