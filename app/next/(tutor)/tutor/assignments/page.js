// Teacher's assignments list. Shows every assignment the caller is
// teacher of (RLS filters via can_view), with student progress
// aggregates: how many assigned, how many completed.
//
// Separate from the student panel: that page shows a student what
// they're on; this page shows a teacher what they've assigned.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentsPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  // Teacher's own rows. Managers/admins see these too via can_view
  // on the teacher_id; this page focuses on what the caller has
  // created (teacher_id = auth.uid()). For managers wanting to see
  // their tutors' assignments, a /tutor/team-assignments could be
  // added later — out of scope here.
  const { data: rows } = await supabase
    .from('assignments_v2')
    .select(`
      id, assignment_type, title, description, due_date,
      archived_at, deleted_at, created_at, question_ids,
      lesson:lessons (title),
      practice_test:practice_tests_v2 (name)
    `)
    .eq('teacher_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const assignments = (rows ?? []).filter((a) => !a.archived_at);
  const archived = (rows ?? []).filter((a) => a.archived_at);

  // Fetch the student-progress aggregates in one query, then fan out.
  const assignmentIds = (rows ?? []).map((a) => a.id);
  const { data: junctionRows } = assignmentIds.length
    ? await supabase
        .from('assignment_students_v2')
        .select('assignment_id, completed_at')
        .in('assignment_id', assignmentIds)
    : { data: [] };

  const statsByAssignment = new Map();
  for (const r of junctionRows ?? []) {
    const s = statsByAssignment.get(r.assignment_id) ?? { total: 0, completed: 0 };
    s.total += 1;
    if (r.completed_at) s.completed += 1;
    statsByAssignment.set(r.assignment_id, s);
  }

  return (
    <main style={{ maxWidth: 1100, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>
            Your assignments
          </h1>
          <p style={{ color: '#4b5563', marginTop: 0 }}>
            {assignments.length} active, {archived.length} archived
          </p>
        </div>
        <Link
          href="/tutor/assignments/new"
          style={{
            padding: '0.5rem 1rem', background: '#2563eb', color: 'white',
            borderRadius: 6, textDecoration: 'none', fontSize: '0.95rem', fontWeight: 600,
          }}
        >
          + New assignment
        </Link>
      </div>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={S.h2}>Active</h2>
        <AssignmentList rows={assignments} stats={statsByAssignment} />
      </section>

      {archived.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <h2 style={S.h2}>Archived</h2>
          <AssignmentList rows={archived} stats={statsByAssignment} />
        </section>
      )}
    </main>
  );
}

function AssignmentList({ rows, stats }) {
  if (rows.length === 0) {
    return <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>None yet.</p>;
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map((a) => {
        const s = stats.get(a.id) ?? { total: 0, completed: 0 };
        const title = a.title
          ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
          ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
          ?? 'Assignment';
        return (
          <li key={a.id}>
            <Link
              href={`/tutor/assignments/${a.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem',
                border: '1px solid #e5e7eb', borderRadius: 8,
                textDecoration: 'none', color: '#111827',
              }}
            >
              <TypeBadge type={a.assignment_type} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{title}</div>
                {a.description && (
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.125rem' }}>
                    {a.description}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                {s.completed}/{s.total} completed
              </div>
              {a.due_date && (
                <div style={{ fontSize: '0.85rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                  Due {new Date(a.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TypeBadge({ type }) {
  const c = {
    questions:     { bg: '#eef2ff', fg: '#4338ca', label: 'Questions' },
    lesson:        { bg: '#ecfdf5', fg: '#047857', label: 'Lesson' },
    practice_test: { bg: '#fff7ed', fg: '#c2410c', label: 'Practice Test' },
  }[type] ?? { bg: '#f3f4f6', fg: '#374151', label: type };
  return (
    <span style={{
      display: 'inline-block', padding: '0.125rem 0.5rem', borderRadius: 999,
      fontSize: '0.7rem', fontWeight: 600, background: c.bg, color: c.fg, flexShrink: 0,
    }}>
      {c.label}
    </span>
  );
}

const S = {
  h2: { fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' },
};
