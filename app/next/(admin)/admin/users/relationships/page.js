// Admin users → Relationships. Bulk-wiring page for the assignment
// hierarchy: pick any teacher + any student (or any manager + any
// teacher) and connect them. The user-detail page covers the
// per-person workflow; this is the bulk view.
//
// Server Component shell. Add forms post directly to Server Actions;
// remove buttons same. No client island.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { UsersNav } from '../UsersNav';
import {
  assignTeacherStudent,
  unassignTeacherStudent,
  assignManagerTeacher,
  unassignManagerTeacher,
} from '../[userId]/actions';

export const dynamic = 'force-dynamic';

export default async function AdminUserRelationshipsPage() {
  const { profile, supabase } = await requireUser();

  if (profile.role !== 'admin') {
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
    if (profile.role === 'student') redirect('/dashboard');
    redirect('/');
  }

  // Fan out: candidate lists + current assignments. Admin RLS lets
  // us read everything, so plain queries suffice.
  const [
    { data: teachers },
    { data: students },
    { data: managers },
    { data: tsa },
    { data: mta },
  ] = await Promise.all([
    supabase.from('profiles').select('id, first_name, last_name, email').eq('role', 'teacher').order('email').limit(1000),
    supabase.from('profiles').select('id, first_name, last_name, email').eq('role', 'student').order('email').limit(2000),
    supabase.from('profiles').select('id, first_name, last_name, email').eq('role', 'manager').order('email').limit(1000),
    supabase
      .from('teacher_student_assignments')
      .select('teacher_id, student_id, teacher:profiles!teacher_student_assignments_teacher_id_fkey(id, first_name, last_name, email), student:profiles!teacher_student_assignments_student_id_fkey(id, first_name, last_name, email)')
      .order('teacher_id'),
    supabase
      .from('manager_teacher_assignments')
      .select('manager_id, teacher_id, manager:profiles!manager_teacher_assignments_manager_id_fkey(id, first_name, last_name, email), teacher:profiles!manager_teacher_assignments_teacher_id_fkey(id, first_name, last_name, email)')
      .order('manager_id'),
  ]);

  return (
    <main style={S.main}>
      <nav style={S.breadcrumb}>
        <a href="/admin" style={S.crumbLink}>← Admin</a>
      </nav>

      <header style={S.header}>
        <h1 style={S.h1}>User relationships</h1>
        <p style={S.sub}>
          Bulk wiring for the assignment hierarchy. For per-person
          relationship edits, open the user detail page from the Users tab.
        </p>
      </header>

      <UsersNav current="relationships" />

      <Section title={`Teacher → Student assignments (${tsa?.length ?? 0})`}>
        <form action={assignTeacherStudent} style={S.addRow}>
          <select name="teacher_id" required style={S.select}>
            <option value="">Teacher…</option>
            {(teachers ?? []).map((t) => (
              <option key={t.id} value={t.id}>{displayName(t) || t.email}</option>
            ))}
          </select>
          <select name="student_id" required style={S.select}>
            <option value="">Student…</option>
            {(students ?? []).map((s) => (
              <option key={s.id} value={s.id}>{displayName(s) || s.email}</option>
            ))}
          </select>
          <button type="submit" style={S.addBtn}>Assign</button>
        </form>

        <AssignmentTable
          rows={tsa ?? []}
          colA="Teacher"
          colB="Student"
          renderA={(r) => displayLink(r.teacher_id, r.teacher)}
          renderB={(r) => displayLink(r.student_id, r.student)}
          renderRemove={(r) => (
            <form action={unassignTeacherStudent}>
              <input type="hidden" name="teacher_id" value={r.teacher_id} />
              <input type="hidden" name="student_id" value={r.student_id} />
              <button type="submit" style={S.removeBtn}>Remove</button>
            </form>
          )}
          rowKey={(r) => `${r.teacher_id}-${r.student_id}`}
          emptyText="No teacher-student assignments yet."
        />
      </Section>

      <Section title={`Manager → Teacher assignments (${mta?.length ?? 0})`}>
        <form action={assignManagerTeacher} style={S.addRow}>
          <select name="manager_id" required style={S.select}>
            <option value="">Manager…</option>
            {(managers ?? []).map((m) => (
              <option key={m.id} value={m.id}>{displayName(m) || m.email}</option>
            ))}
          </select>
          <select name="teacher_id" required style={S.select}>
            <option value="">Teacher…</option>
            {(teachers ?? []).map((t) => (
              <option key={t.id} value={t.id}>{displayName(t) || t.email}</option>
            ))}
          </select>
          <button type="submit" style={S.addBtn}>Assign</button>
        </form>

        <AssignmentTable
          rows={mta ?? []}
          colA="Manager"
          colB="Teacher"
          renderA={(r) => displayLink(r.manager_id, r.manager)}
          renderB={(r) => displayLink(r.teacher_id, r.teacher)}
          renderRemove={(r) => (
            <form action={unassignManagerTeacher}>
              <input type="hidden" name="manager_id" value={r.manager_id} />
              <input type="hidden" name="teacher_id" value={r.teacher_id} />
              <button type="submit" style={S.removeBtn}>Remove</button>
            </form>
          )}
          rowKey={(r) => `${r.manager_id}-${r.teacher_id}`}
          emptyText="No manager-teacher assignments yet."
        />
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

function AssignmentTable({ rows, colA, colB, renderA, renderB, renderRemove, rowKey, emptyText }) {
  if (rows.length === 0) {
    return <p style={S.empty}>{emptyText}</p>;
  }
  return (
    <div style={S.tableWrap}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>{colA}</th>
            <th style={S.th}>{colB}</th>
            <th style={{ ...S.th, width: 80 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              <td style={S.td}>{renderA(r)}</td>
              <td style={S.td}>{renderB(r)}</td>
              <td style={S.td}>{renderRemove(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function displayName(p) {
  if (!p) return null;
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

function displayLink(id, profile) {
  const text = displayName(profile) || profile?.email || id.slice(0, 8);
  return <a href={`/admin/users/${id}`} style={S.userLink}>{text}</a>;
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
  addRow: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
  select: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', background: 'white', minWidth: 200 },
  addBtn: { padding: '0.4rem 0.85rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  tableWrap: { overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  th: { textAlign: 'left', padding: '0.5rem 0.75rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: '0.75rem', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.025em' },
  td: { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6' },
  userLink: { color: '#2563eb', textDecoration: 'none' },
  removeBtn: { padding: '0.25rem 0.6rem', background: 'transparent', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 4, fontSize: '0.75rem', cursor: 'pointer' },
  empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem', padding: '0.75rem 0' },
};
