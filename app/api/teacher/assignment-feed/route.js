import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/teacher/assignment-feed
// Returns per-student assignment rows for the teacher dashboard panel.
// Each row = one (assignment, student) pair, sorted by due_date ascending (past-due first).
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!['teacher', 'manager', 'admin'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch assignments
  let query = supabase
    .from('question_assignments')
    .select('id, title, due_date, question_ids');

  if (profile.role !== 'admin') {
    query = query.eq('teacher_id', user.id);
  }

  const { data: assignments, error: aErr } = await query;
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
  if (!assignments?.length) return NextResponse.json({ rows: [], total: 0 });

  const assignmentIds = assignments.map(a => a.id);
  const assignmentMap = {};
  for (const a of assignments) assignmentMap[a.id] = a;

  // Fetch student assignments
  const { data: studentAssignments } = await supabase
    .from('question_assignment_students')
    .select('assignment_id, student_id')
    .in('assignment_id', assignmentIds);

  if (!studentAssignments?.length) return NextResponse.json({ rows: [], total: 0 });

  // Fetch student profiles
  const studentIds = [...new Set(studentAssignments.map(sa => sa.student_id))];
  const { data: studentProfiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email')
    .in('id', studentIds);

  const studentMap = {};
  for (const s of studentProfiles || []) {
    studentMap[s.id] = `${s.first_name || ''} ${s.last_name || ''}`.trim() || s.email || '—';
  }

  // Batch fetch completion counts
  const allQuestionIds = [...new Set(assignments.flatMap(a => a.question_ids || []))];
  const { data: statusRows } = allQuestionIds.length && studentIds.length
    ? await supabase
        .from('question_status')
        .select('user_id, question_id')
        .in('user_id', studentIds)
        .in('question_id', allQuestionIds)
        .eq('is_done', true)
    : { data: [] };

  const doneByStudent = {};
  for (const s of statusRows || []) {
    if (!doneByStudent[s.user_id]) doneByStudent[s.user_id] = new Set();
    doneByStudent[s.user_id].add(s.question_id);
  }

  // Build rows
  const rows = studentAssignments.map(sa => {
    const a = assignmentMap[sa.assignment_id];
    if (!a) return null;
    const qids = a.question_ids || [];
    const doneSet = doneByStudent[sa.student_id] || new Set();
    const completedCount = qids.filter(qid => doneSet.has(qid)).length;

    return {
      assignment_id: a.id,
      title: a.title,
      due_date: a.due_date,
      question_count: qids.length,
      completed_count: completedCount,
      student_name: studentMap[sa.student_id] || '—',
    };
  }).filter(Boolean);

  // Sort: due_date ascending (nulls last)
  rows.sort((a, b) => {
    if (a.due_date && b.due_date) return new Date(a.due_date) - new Date(b.due_date);
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return (a.title || '').localeCompare(b.title || '');
  });

  return NextResponse.json({ rows, total: rows.length });
}
