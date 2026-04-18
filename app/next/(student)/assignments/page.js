// Student assignments list. See docs/architecture-plan.md §3.4.
//
// Type-agnostic listing: one query against assignments_v2 via the
// assignment_students_v2 child table, branched per row at render
// time on assignment_type. This is the page that motivated the
// Phase 3 unification — the product goal was "one panel, branches
// on type" and this is where that payoff first shows up.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';

export const dynamic = 'force-dynamic';

export default async function StudentAssignmentsPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const rows = await loadStudentAssignments(supabase, user.id);

  return (
    <main style={{ maxWidth: 960, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Assignments</h1>
      <p style={{ color: '#4b5563', marginTop: 0 }}>
        Everything your tutor has assigned you. Click one to work on it.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: '#6b7280', marginTop: '1.5rem' }}>
          No assignments yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1.5rem 0 0 0', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rows.map((r) => (
            <li key={r.id}>
              <AssignmentCard row={r} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────
// Data loader. RLS on assignments_v2 + assignment_students_v2 is
// what actually scopes the result to "assignments I'm a student of":
//   - assignment_students_v2 SELECT allows student_id = auth.uid()
//   - assignments_v2 SELECT allows is_v2_assignment_student(id, auth.uid())
// so reading via the child table and foreign-table joining to the
// parent gives us exactly the rows the student can see.
// ──────────────────────────────────────────────────────────────
async function loadStudentAssignments(supabase, userId) {
  const { data } = await supabase
    .from('assignment_students_v2')
    .select(`
      completed_at,
      assignment:assignments_v2 (
        id,
        assignment_type,
        title,
        description,
        due_date,
        archived_at,
        deleted_at,
        question_ids,
        lesson_id,
        practice_test_id,
        filter_criteria,
        teacher:profiles!assignments_v2_teacher_id_fkey (
          first_name,
          last_name
        ),
        lesson:lessons (title),
        practice_test:practice_tests_v2 (name, code)
      )
    `)
    .eq('student_id', userId);

  const rows = (data ?? [])
    .map((r) => ({ ...r.assignment, student_completed_at: r.completed_at }))
    // Drop rows whose parent joined to NULL (shouldn't happen with
    // the FK but defensive) or that are soft-deleted/archived.
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at);

  // Sort: not-completed first (by due_date asc, nulls last), then
  // completed at the end.
  rows.sort((a, b) => {
    const aDone = a.student_completed_at != null;
    const bDone = b.student_completed_at != null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    const aDue = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
    const bDue = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });

  return rows;
}

// ──────────────────────────────────────────────────────────────
// Per-row rendering. Branches on assignment_type for the secondary
// line ("5 questions" / "Lesson: …" / "Practice Test: …"); the
// rest of the card is type-agnostic.
// ──────────────────────────────────────────────────────────────
function AssignmentCard({ row }) {
  const title = displayTitle(row);
  const subtitle = displaySubtitle(row);
  const dueLabel = row.due_date ? formatDate(row.due_date) : null;
  const isOverdue =
    row.due_date && row.student_completed_at == null && Date.parse(row.due_date) < Date.now();
  const teacher = row.teacher
    ? [row.teacher.first_name, row.teacher.last_name].filter(Boolean).join(' ')
    : null;
  const done = row.student_completed_at != null;

  return (
    <Link
      href={`/assignments/${row.id}`}
      style={{
        display: 'block',
        padding: '1rem 1.25rem',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        textDecoration: 'none',
        color: '#111827',
        background: done ? '#f9fafb' : '#ffffff',
      }}
    >
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
        <TypeBadge type={row.assignment_type} />
        <div style={{ fontWeight: 600, fontSize: '1rem', flex: 1, minWidth: 0 }}>
          {title}
        </div>
        {done && (
          <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>
            Completed
          </span>
        )}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '0.25rem' }}>
          {subtitle}
        </div>
      )}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
        {teacher && <span>Assigned by {teacher}</span>}
        {dueLabel && (
          <span style={{ color: isOverdue ? '#b91c1c' : undefined }}>
            Due {dueLabel}{isOverdue ? ' (overdue)' : ''}
          </span>
        )}
      </div>
    </Link>
  );
}

function TypeBadge({ type }) {
  const colors = {
    questions:     { bg: '#eef2ff', fg: '#4338ca', label: 'Questions' },
    lesson:        { bg: '#ecfdf5', fg: '#047857', label: 'Lesson' },
    practice_test: { bg: '#fff7ed', fg: '#c2410c', label: 'Practice Test' },
  };
  const c = colors[type] ?? { bg: '#f3f4f6', fg: '#374151', label: type };
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.125rem 0.5rem',
      borderRadius: 999,
      fontSize: '0.7rem',
      fontWeight: 600,
      background: c.bg,
      color: c.fg,
    }}>
      {c.label}
    </span>
  );
}

function displayTitle(row) {
  if (row.title) return row.title;
  if (row.assignment_type === 'lesson') return row.lesson?.title ?? 'Lesson';
  if (row.assignment_type === 'practice_test') return row.practice_test?.name ?? 'Practice Test';
  return 'Assignment';
}

function displaySubtitle(row) {
  if (row.description) return row.description;
  if (row.assignment_type === 'questions') {
    const n = Array.isArray(row.question_ids) ? row.question_ids.length : 0;
    return n === 0 ? null : `${n} question${n === 1 ? '' : 's'}`;
  }
  if (row.assignment_type === 'practice_test') {
    const sections = row.filter_criteria?.sections;
    if (sections && sections !== 'both') return `${sections.toUpperCase()} only`;
    return null;
  }
  return null;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
