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
    .select('id, title, due_date, question_ids, completed_at');

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

  // Batch fetch completion status per question
  // Use .eq('is_done', true) to only fetch completed statuses, and add a generous limit
  // to avoid Supabase's default 1000-row cap silently dropping data.
  const allQuestionIds = [...new Set(assignments.flatMap(a => a.question_ids || []))];
  let statusRows = [];
  if (allQuestionIds.length && studentIds.length) {
    // Batch by student to avoid hitting row limits with large cross-products
    const BATCH = 20;
    for (let i = 0; i < studentIds.length; i += BATCH) {
      const studentBatch = studentIds.slice(i, i + BATCH);
      const { data } = await supabase
        .from('question_status')
        .select('user_id, question_id, is_done, last_is_correct, marked_for_review')
        .in('user_id', studentBatch)
        .in('question_id', allQuestionIds)
        .eq('is_done', true)
        .limit(10000);
      if (data) statusRows.push(...data);
    }
  }

  const statusByUserQuestion = {};
  const doneByStudent = {};
  for (const s of statusRows || []) {
    statusByUserQuestion[`${s.user_id}:${s.question_id}`] = s;
    if (s.is_done) {
      if (!doneByStudent[s.user_id]) doneByStudent[s.user_id] = new Set();
      doneByStudent[s.user_id].add(s.question_id);
    }
  }

  // Fetch question metadata (difficulty, domain, skill) from taxonomy table
  let questionMeta = {};
  if (allQuestionIds.length > 0) {
    const { data: qMetaRows } = await supabase
      .from('question_taxonomy')
      .select('question_id, difficulty, domain_name, skill_name')
      .in('question_id', allQuestionIds);
    for (const q of (qMetaRows || [])) {
      questionMeta[q.question_id] = q;
    }
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
      completed_at: a.completed_at || null,
      question_ids: qids,
      question_count: qids.length,
      completed_count: completedCount,
      student_id: sa.student_id,
      student_name: studentMap[sa.student_id] || '—',
      question_statuses: qids.map(qid => {
        const qs = statusByUserQuestion[`${sa.student_id}:${qid}`] || {};
        const meta = questionMeta[qid] || {};
        return {
          question_id: qid,
          is_done: qs.is_done || false,
          last_is_correct: qs.last_is_correct || false,
          marked_for_review: qs.marked_for_review || false,
          difficulty: meta.difficulty,
          domain_name: meta.domain_name || '',
          skill_name: meta.skill_name || '',
        };
      }),
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
