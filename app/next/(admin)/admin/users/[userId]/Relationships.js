// Server-rendered relationship sections for the user-detail page.
// Reads data, renders lists + add/remove forms that call Server
// Actions directly. No client island — Server Actions invoked
// from <form action={...}> work without one.

import {
  assignTeacherStudent,
  unassignTeacherStudent,
  assignManagerTeacher,
  unassignManagerTeacher,
} from './actions';
import { Button } from '@/lib/ui/Button';

export async function Relationships({ supabase, subject }) {
  const { id, role } = subject;

  if (role === 'student' || role === 'practice') {
    return <StudentRelationships supabase={supabase} subject={subject} />;
  }
  if (role === 'teacher') {
    return <TeacherRelationships supabase={supabase} subject={subject} />;
  }
  if (role === 'manager') {
    return <ManagerRelationships supabase={supabase} subject={subject} />;
  }
  if (role === 'admin') {
    return (
      <p style={S.empty}>
        Admins don&apos;t use the assignment hierarchy. They see everyone.
      </p>
    );
  }
  return null;
}

async function StudentRelationships({ supabase, subject }) {
  const [{ data: tsa }, { data: teachers }] = await Promise.all([
    supabase
      .from('teacher_student_assignments')
      .select('teacher_id, profiles!teacher_student_assignments_teacher_id_fkey(id, first_name, last_name, email)')
      .eq('student_id', subject.id),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'teacher')
      .order('email', { ascending: true })
      .limit(500),
  ]);

  const assignedIds = new Set((tsa ?? []).map((a) => a.teacher_id));
  const availableTeachers = (teachers ?? []).filter((t) => !assignedIds.has(t.id));

  return (
    <div style={S.section}>
      <h3 style={S.h3}>Assigned to teachers ({tsa?.length ?? 0})</h3>
      <ul style={S.list}>
        {(tsa ?? []).map((row) => (
          <li key={row.teacher_id} style={S.listRow}>
            <span>{displayName(row.profiles) || row.profiles?.email || row.teacher_id.slice(0, 8)}</span>
            <form action={unassignTeacherStudent}>
              <input type="hidden" name="teacher_id" value={row.teacher_id} />
              <input type="hidden" name="student_id" value={subject.id} />
              <input type="hidden" name="subject_id" value={subject.id} />
              <Button type="submit" variant="remove" size="sm">Remove</Button>
            </form>
          </li>
        ))}
        {(tsa ?? []).length === 0 && <li style={S.empty}>No teachers assigned.</li>}
      </ul>

      <form action={assignTeacherStudent} style={S.addRow}>
        <input type="hidden" name="student_id" value={subject.id} />
        <input type="hidden" name="subject_id" value={subject.id} />
        <select name="teacher_id" required style={S.select}>
          <option value="">Pick a teacher to assign…</option>
          {availableTeachers.map((t) => (
            <option key={t.id} value={t.id}>
              {displayName(t) || t.email}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" size="sm">Assign</Button>
      </form>
    </div>
  );
}

async function TeacherRelationships({ supabase, subject }) {
  const [{ data: tsaStudents }, { data: mtaManagers }, { data: students }, { data: managers }] = await Promise.all([
    supabase
      .from('teacher_student_assignments')
      .select('student_id, profiles!teacher_student_assignments_student_id_fkey(id, first_name, last_name, email)')
      .eq('teacher_id', subject.id),
    supabase
      .from('manager_teacher_assignments')
      .select('manager_id, profiles!manager_teacher_assignments_manager_id_fkey(id, first_name, last_name, email)')
      .eq('teacher_id', subject.id),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'student')
      .order('email', { ascending: true })
      .limit(500),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'manager')
      .order('email', { ascending: true })
      .limit(500),
  ]);

  const assignedStudentIds = new Set((tsaStudents ?? []).map((r) => r.student_id));
  const availableStudents = (students ?? []).filter((s) => !assignedStudentIds.has(s.id));
  const assignedManagerIds = new Set((mtaManagers ?? []).map((r) => r.manager_id));
  const availableManagers = (managers ?? []).filter((m) => !assignedManagerIds.has(m.id));

  return (
    <>
      <div style={S.section}>
        <h3 style={S.h3}>My students ({tsaStudents?.length ?? 0})</h3>
        <ul style={S.list}>
          {(tsaStudents ?? []).map((row) => (
            <li key={row.student_id} style={S.listRow}>
              <span>{displayName(row.profiles) || row.profiles?.email || row.student_id.slice(0, 8)}</span>
              <form action={unassignTeacherStudent}>
                <input type="hidden" name="teacher_id" value={subject.id} />
                <input type="hidden" name="student_id" value={row.student_id} />
                <input type="hidden" name="subject_id" value={subject.id} />
                <Button type="submit" variant="remove" size="sm">Remove</Button>
              </form>
            </li>
          ))}
          {(tsaStudents ?? []).length === 0 && <li style={S.empty}>No students assigned.</li>}
        </ul>
        <form action={assignTeacherStudent} style={S.addRow}>
          <input type="hidden" name="teacher_id" value={subject.id} />
          <input type="hidden" name="subject_id" value={subject.id} />
          <select name="student_id" required style={S.select}>
            <option value="">Pick a student to assign…</option>
            {availableStudents.map((s) => (
              <option key={s.id} value={s.id}>{displayName(s) || s.email}</option>
            ))}
          </select>
          <Button type="submit" variant="primary" size="sm">Assign</Button>
        </form>
      </div>

      <div style={S.section}>
        <h3 style={S.h3}>Managed by ({mtaManagers?.length ?? 0})</h3>
        <ul style={S.list}>
          {(mtaManagers ?? []).map((row) => (
            <li key={row.manager_id} style={S.listRow}>
              <span>{displayName(row.profiles) || row.profiles?.email || row.manager_id.slice(0, 8)}</span>
              <form action={unassignManagerTeacher}>
                <input type="hidden" name="manager_id" value={row.manager_id} />
                <input type="hidden" name="teacher_id" value={subject.id} />
                <input type="hidden" name="subject_id" value={subject.id} />
                <Button type="submit" variant="remove" size="sm">Remove</Button>
              </form>
            </li>
          ))}
          {(mtaManagers ?? []).length === 0 && <li style={S.empty}>No managers oversee this teacher.</li>}
        </ul>
        <form action={assignManagerTeacher} style={S.addRow}>
          <input type="hidden" name="teacher_id" value={subject.id} />
          <input type="hidden" name="subject_id" value={subject.id} />
          <select name="manager_id" required style={S.select}>
            <option value="">Pick a manager to assign…</option>
            {availableManagers.map((m) => (
              <option key={m.id} value={m.id}>{displayName(m) || m.email}</option>
            ))}
          </select>
          <Button type="submit" variant="primary" size="sm">Assign</Button>
        </form>
      </div>
    </>
  );
}

async function ManagerRelationships({ supabase, subject }) {
  const [{ data: mta }, { data: teachers }] = await Promise.all([
    supabase
      .from('manager_teacher_assignments')
      .select('teacher_id, profiles!manager_teacher_assignments_teacher_id_fkey(id, first_name, last_name, email)')
      .eq('manager_id', subject.id),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('role', 'teacher')
      .order('email', { ascending: true })
      .limit(500),
  ]);

  const assignedIds = new Set((mta ?? []).map((a) => a.teacher_id));
  const availableTeachers = (teachers ?? []).filter((t) => !assignedIds.has(t.id));

  return (
    <div style={S.section}>
      <h3 style={S.h3}>Managed teachers ({mta?.length ?? 0})</h3>
      <ul style={S.list}>
        {(mta ?? []).map((row) => (
          <li key={row.teacher_id} style={S.listRow}>
            <span>{displayName(row.profiles) || row.profiles?.email || row.teacher_id.slice(0, 8)}</span>
            <form action={unassignManagerTeacher}>
              <input type="hidden" name="manager_id" value={subject.id} />
              <input type="hidden" name="teacher_id" value={row.teacher_id} />
              <input type="hidden" name="subject_id" value={subject.id} />
              <Button type="submit" variant="remove" size="sm">Remove</Button>
            </form>
          </li>
        ))}
        {(mta ?? []).length === 0 && <li style={S.empty}>No teachers assigned.</li>}
      </ul>

      <form action={assignManagerTeacher} style={S.addRow}>
        <input type="hidden" name="manager_id" value={subject.id} />
        <input type="hidden" name="subject_id" value={subject.id} />
        <select name="teacher_id" required style={S.select}>
          <option value="">Pick a teacher to assign…</option>
          {availableTeachers.map((t) => (
            <option key={t.id} value={t.id}>{displayName(t) || t.email}</option>
          ))}
        </select>
        <Button type="submit" variant="primary" size="sm">Assign</Button>
      </form>
    </div>
  );
}

function displayName(p) {
  if (!p) return null;
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

const S = {
  section: { marginBottom: '1.5rem' },
  h3: { fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem', color: '#374151' },
  list: { listStyle: 'none', padding: 0, margin: 0, border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' },
  listRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.9rem' },
  empty: { padding: '0.75rem', color: '#9ca3af', fontStyle: 'italic', fontSize: '0.85rem' },
  addRow: { display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' },
  select: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', background: 'white', flex: 1, maxWidth: 360 },
};
