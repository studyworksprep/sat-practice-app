// Teacher-facing assignment detail. Shows the assignment's metadata,
// the list of enrolled students, and each student's progress (attempts
// count, accuracy, completion state).
//
// Complements the student's /assignments/[id] page. RLS on
// assignments_v2 allows SELECT via can_view(teacher_id), so the
// caller reads the row as themselves — no service-role bypass.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { StatCard } from '@/lib/ui/StatCard';
import { Table, Th, Td } from '@/lib/ui/Table';
import { formatDate } from '@/lib/formatters';

export const dynamic = 'force-dynamic';

export default async function TutorAssignmentDetailPage({ params }) {
  const { id: assignmentId } = await params;
  const { profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') {
    redirect('/dashboard');
  }
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    redirect('/');
  }

  const [{ data: assignment }, { data: junctionRows }] = await Promise.all([
    supabase
      .from('assignments_v2')
      .select(`
        id, assignment_type, title, description, due_date, archived_at, deleted_at,
        created_at, question_ids, filter_criteria, lesson_id, practice_test_id,
        teacher:profiles!assignments_v2_teacher_id_fkey (id, first_name, last_name),
        lesson:lessons (id, title),
        practice_test:practice_tests_v2 (id, code, name)
      `)
      .eq('id', assignmentId)
      .maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select(`
        student_id, completed_at, created_at,
        student:profiles!assignment_students_v2_student_id_fkey (id, first_name, last_name, email)
      `)
      .eq('assignment_id', assignmentId),
  ]);

  if (!assignment || assignment.deleted_at) notFound();

  // For 'questions' assignments, compute per-student progress from
  // the attempts table directly (not question_status, which the new
  // tree doesn't reliably maintain). Reduce client-side: per (user,
  // question) pair, the most recent attempt wins for the correct flag.
  const questionIds =
    assignment.assignment_type === 'questions' && Array.isArray(assignment.question_ids)
      ? assignment.question_ids
      : [];
  const studentIds = (junctionRows ?? []).map((r) => r.student_id);

  let attemptRows = [];
  if (questionIds.length > 0 && studentIds.length > 0) {
    const { data } = await supabase
      .from('attempts')
      .select('user_id, question_id, is_correct, created_at')
      .in('user_id', studentIds)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false });
    attemptRows = data ?? [];
  }

  const statusByStudent = new Map();
  const seenPairs = new Set();
  for (const r of attemptRows) {
    const key = `${r.user_id}::${r.question_id}`;
    if (seenPairs.has(key)) continue; // older attempts for same pair
    seenPairs.add(key);
    const s = statusByStudent.get(r.user_id) ?? { done: 0, correct: 0 };
    s.done += 1;
    if (r.is_correct) s.correct += 1;
    statusByStudent.set(r.user_id, s);
  }

  const students = (junctionRows ?? []).map((r) => {
    const stats = statusByStudent.get(r.student_id) ?? { done: 0, correct: 0 };
    const name =
      [r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ')
      || r.student?.email || 'Student';
    return {
      id: r.student_id,
      name,
      email: r.student?.email ?? null,
      completed_at: r.completed_at,
      done: stats.done,
      correct: stats.correct,
    };
  });
  students.sort((a, b) => a.name.localeCompare(b.name));

  const title = assignment.title
    ?? (assignment.assignment_type === 'lesson' ? assignment.lesson?.title : null)
    ?? (assignment.assignment_type === 'practice_test' ? assignment.practice_test?.name : null)
    ?? 'Assignment';

  const totalQuestions = questionIds.length;
  const completedCount = students.filter((s) => s.completed_at).length;

  return (
    <main style={{ maxWidth: 1000, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/tutor/assignments" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.9rem' }}>
          ← Your assignments
        </Link>
      </nav>

      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.25rem' }}>{title}</h1>
        {assignment.description && (
          <p style={{ color: '#4b5563', marginTop: 0 }}>{assignment.description}</p>
        )}
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span>Type: {typeLabel(assignment.assignment_type)}</span>
          {assignment.due_date && (
            <span>Due {formatDate(assignment.due_date)}</span>
          )}
          {assignment.archived_at && <span style={{ color: '#b91c1c' }}>Archived</span>}
        </div>
      </header>

      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '0.75rem', marginBottom: '1.5rem',
      }}>
        <StatCard label="Students" value={students.length} />
        <StatCard label="Completed" value={`${completedCount} / ${students.length}`} />
        {assignment.assignment_type === 'questions' && (
          <StatCard label="Questions" value={totalQuestions} />
        )}
      </section>

      <section>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Enrolled students
        </h2>
        {students.length === 0 ? (
          <p style={{ color: '#9ca3af', fontStyle: 'italic' }}>No students assigned.</p>
        ) : (
          <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  {assignment.assignment_type === 'questions' && (
                    <>
                      <Th>Done</Th>
                      <Th>Accuracy</Th>
                    </>
                  )}
                  <Th>Completed</Th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <Td>
                      <Link href={`/tutor/students/${s.id}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                        {s.name}
                      </Link>
                      {s.email && (
                        <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>{s.email}</div>
                      )}
                    </Td>
                    {assignment.assignment_type === 'questions' && (
                      <>
                        <Td>
                          {s.done}/{totalQuestions}
                        </Td>
                        <Td>
                          {s.done > 0 ? `${Math.round((s.correct / s.done) * 100)}%` : '—'}
                        </Td>
                      </>
                    )}
                    <Td>
                      {s.completed_at
                        ? formatDate(s.completed_at)
                        : <span style={{ color: '#9ca3af' }}>—</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
          </Table>
        )}
      </section>
    </main>
  );
}

function typeLabel(t) {
  return { questions: 'Questions', lesson: 'Lesson', practice_test: 'Practice Test' }[t] ?? t;
}

