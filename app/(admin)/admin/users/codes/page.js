// Admin users → Codes. Two operational tools:
//
// - Teacher Codes: bulk admin-created signup tokens identifying
//   STUDYWORKS tutors. Anyone signing up with one becomes an exempt
//   (free) teacher. Single-use, tracked.
// - Student Invitations: admin-issued, single-use, email-bound codes
//   (created from the Users page) that assign a student to a tutor at
//   signup and grant sponsored access. The tracker below shows each
//   code, who claimed it and when, and the tutor it belongs to.
//   (This replaced the retired per-teacher multi-use invite-code
//   manager — those codes were shareable bearer tokens for free
//   access; see the 2026-07-16 owner policy.)
//
// Server Component shell. Forms post directly to Server Actions.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/lib/ui/Button';
import { Table, Th, Td } from '@/lib/ui/Table';
import { UsersNav } from '../UsersNav';
import { createTeacherCode, revokeTeacherCode, revokeStudentInvite } from './actions';
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

  const [{ data: codes }, { data: invites }] = await Promise.all([
    supabase
      .from('teacher_codes')
      .select('id, code, used_by, used_at, created_at, used_by_profile:profiles!teacher_codes_used_by_fkey(id, first_name, last_name, email)')
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('student_invite_codes')
      .select(`
        id, code, email, used_by, used_at, created_at,
        teacher:profiles!student_invite_codes_teacher_id_fkey(id, first_name, last_name, email),
        claimed_by:profiles!student_invite_codes_used_by_fkey(id, first_name, last_name, email)
      `)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const codesAvailable = (codes ?? []).filter((c) => !c.used_by).length;
  const codesUsed = (codes ?? []).length - codesAvailable;
  const invitesOpen = (invites ?? []).filter((i) => !i.used_by).length;
  const invitesClaimed = (invites ?? []).length - invitesOpen;

  return (
    <main className={a.container}>
      <nav className={a.breadcrumb}>
        <a href="/admin">← Admin</a>
      </nav>

      <header className={a.header}>
        <div className={a.eyebrow}>Admin · Codes</div>
        <h1 className={a.h1}>Signup codes</h1>
        <p className={a.sub}>
          Teacher Codes identify Studyworks tutors (consumed once at signup).
          Student Invitations are single-use, email-bound codes issued from
          the Users page — the only way a sponsored student joins.
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

      <Section title={`Student Invitations (${invitesOpen} open · ${invitesClaimed} claimed)`}>
        <p className={f.formHint}>
          Issued from the <a href="/admin/users" style={S.userLink}>Users page</a> —
          each code is bound to one email, works once, and assigns the
          student to its tutor at signup. Revoking an open invitation
          invalidates the code immediately.
        </p>

        {(invites ?? []).length === 0 ? (
          <p className={f.empty}>No student invitations yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Invited email</Th>
                <Th>Tutor</Th>
                <Th>Status</Th>
                <Th>Claimed by</Th>
                <Th>Claimed</Th>
                <Th>Created</Th>
                <Th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {(invites ?? []).map((i) => (
                <tr key={i.id}>
                  <Td style={S.code}>{i.code}</Td>
                  <Td>{i.email}</Td>
                  <Td>
                    {i.teacher ? (
                      <a href={`/admin/users/${i.teacher.id}`} style={S.userLink}>
                        {displayName(i.teacher) || i.teacher.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {i.used_by ? (
                      <span style={{ ...S.statusPill, ...S.statusUsed }}>Claimed</span>
                    ) : (
                      <span style={{ ...S.statusPill, ...S.statusAvail }}>Open</span>
                    )}
                  </Td>
                  <Td>
                    {i.used_by ? (
                      <a href={`/admin/users/${i.used_by}`} style={S.userLink}>
                        {displayName(i.claimed_by) || i.claimed_by?.email || i.used_by.slice(0, 8)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td style={{ color: 'var(--fg3)', fontSize: 12 }}>
                    {i.used_at ? formatDate(i.used_at) : '—'}
                  </Td>
                  <Td style={{ color: 'var(--fg3)', fontSize: 12 }}>
                    {formatDate(i.created_at) || '—'}
                  </Td>
                  <Td>
                    {!i.used_by && (
                      <form action={revokeStudentInvite}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button type="submit" variant="remove" size="sm">Revoke</Button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
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
