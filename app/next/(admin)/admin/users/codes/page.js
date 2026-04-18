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
import { UsersNav } from '../UsersNav';
import {
  createTeacherCode,
  revokeTeacherCode,
  setTeacherInviteCode,
  clearTeacherInviteCode,
} from './actions';

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
    <main style={S.main}>
      <nav style={S.breadcrumb}>
        <a href="/admin" style={S.crumbLink}>← Admin</a>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>Signup codes</h1>
        <p style={S.sub}>
          Teacher Codes are bulk admin-created tokens (consumed at signup).
          Teacher Invite Codes are per-teacher personal codes students enter
          during signup to auto-assign to that teacher.
        </p>
      </header>

      <UsersNav current="codes" />

      <Section title={`Teacher Codes (${codesAvailable} available · ${codesUsed} used)`}>
        <form action={createTeacherCode} style={S.addRow}>
          <label style={S.label}>
            <span style={S.labelText}>New code</span>
            <input
              name="code"
              type="text"
              placeholder="Leave blank to auto-generate"
              style={{ ...S.input, textTransform: 'uppercase' }}
            />
          </label>
          <Button type="submit" variant="primary" size="sm">Create</Button>
        </form>

        {(codes ?? []).length === 0 ? (
          <p style={S.empty}>No teacher codes yet.</p>
        ) : (
          <div style={S.tableWrap}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Code</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Used by</th>
                  <th style={S.th}>Created</th>
                  <th style={{ ...S.th, width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {(codes ?? []).map((c) => (
                  <tr key={c.id}>
                    <td style={S.tdCode}>{c.code}</td>
                    <td style={S.td}>
                      {c.used_by ? (
                        <span style={S.badgeUsed}>Used</span>
                      ) : (
                        <span style={S.badgeAvail}>Available</span>
                      )}
                    </td>
                    <td style={S.td}>
                      {c.used_by ? (
                        <a href={`/admin/users/${c.used_by}`} style={S.userLink}>
                          {displayName(c.used_by_profile) || c.used_by_profile?.email || c.used_by.slice(0, 8)}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={S.tdMuted}>{formatDate(c.created_at) || '—'}</td>
                    <td style={S.td}>
                      <form action={revokeTeacherCode}>
                        <input type="hidden" name="id" value={c.id} />
                        <Button type="submit" variant="remove" size="sm">Revoke</Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Teacher Invite Codes (${teachersWithCodes} of ${teachers?.length ?? 0} teachers have a code)`}>
        <p style={S.note}>
          Each teacher can have one invite code. Generate a fresh one by
          submitting an empty value.
        </p>

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Teacher</th>
                <th style={S.th}>Current code</th>
                <th style={S.th}>Set / regenerate</th>
                <th style={{ ...S.th, width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {(teachers ?? []).map((t) => (
                <tr key={t.id}>
                  <td style={S.td}>
                    <a href={`/admin/users/${t.id}`} style={S.userLink}>
                      {displayName(t) || t.email}
                    </a>
                  </td>
                  <td style={S.tdCode}>
                    {t.teacher_invite_code ?? <span style={{ color: '#9ca3af' }}>—</span>}
                  </td>
                  <td style={S.td}>
                    <form action={setTeacherInviteCode} style={S.inlineForm}>
                      <input type="hidden" name="teacher_id" value={t.id} />
                      <input
                        name="code"
                        type="text"
                        placeholder={t.teacher_invite_code ? 'New code or blank to rotate' : 'Code or blank for auto'}
                        style={{ ...S.input, textTransform: 'uppercase', fontSize: '0.8rem', maxWidth: 200 }}
                      />
                      <Button type="submit" variant="primary" size="sm">
                        {t.teacher_invite_code ? 'Change' : 'Generate'}
                      </Button>
                    </form>
                  </td>
                  <td style={S.td}>
                    {t.teacher_invite_code && (
                      <form action={clearTeacherInviteCode}>
                        <input type="hidden" name="teacher_id" value={t.id} />
                        <Button type="submit" variant="remove" size="sm">Clear</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
              {(teachers ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} style={S.empty}>No teachers found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section style={S.section}>
      <h2 style={S.h2}>{title}</h2>
      {children}
    </section>
  );
}

function displayName(p) {
  if (!p) return null;
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}


const S = {
  main: { maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  breadcrumb: { marginBottom: '1rem', fontSize: '0.85rem', color: '#6b7280' },
  crumbLink: { color: '#2563eb', textDecoration: 'none' },
  header: { marginBottom: '1.5rem' },
  h1: { fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' },
  sub: { color: '#4b5563', marginTop: 0 },
  section: { marginBottom: '1.5rem', padding: '1.25rem', background: 'white', border: '1px solid #e5e7eb', borderRadius: 10 },
  h2: { fontSize: '1rem', fontWeight: 600, marginTop: 0, marginBottom: '1rem', color: '#111827' },
  note: { fontSize: '0.85rem', color: '#6b7280', marginTop: 0, marginBottom: '1rem' },
  addRow: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' },
  inlineForm: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  label: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  labelText: { fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  input: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', minWidth: 220 },
  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '0.5rem 0.75rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.025em' },
  td: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6' },
  tdCode: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6', fontFamily: 'monospace', fontWeight: 600, letterSpacing: '0.05em' },
  tdMuted: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: '0.85rem' },
  userLink: { color: '#2563eb', textDecoration: 'none' },
  badgeAvail: { padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: '#dcfce7', color: '#166534' },
  badgeUsed:  { padding: '0.125rem 0.5rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 600, background: '#f3f4f6', color: '#6b7280' },
  empty: { padding: '0.75rem', color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', textAlign: 'center' },
};
