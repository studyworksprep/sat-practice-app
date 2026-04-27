import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/assignments/[id] — student-facing: get assignment detail with question progress
export const GET = legacyApiRoute(async (request, { params }) => {
  const { user, supabase } = await requireUser();

  const { id } = await params;

  // Verify student is assigned
  const { data: assigned } = await supabase
    .from('question_assignment_students')
    .select('assignment_id')
    .eq('assignment_id', id)
    .eq('student_id', user.id)
    .maybeSingle();

  if (!assigned) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch assignment (try with filter_criteria, fall back without)
  let { data: assignment, error: aErr } = await supabase
    .from('question_assignments')
    .select('id, title, description, due_date, question_ids, teacher_id, created_at, filter_criteria')
    .eq('id', id)
    .single();

  if (aErr && !assignment) {
    const fb = await supabase
      .from('question_assignments')
      .select('id, title, description, due_date, question_ids, teacher_id, created_at')
      .eq('id', id)
      .single();
    assignment = fb.data;
  }

  if (!assignment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Teacher name
  const { data: teacher } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', assignment.teacher_id)
    .single();

  const teacherName = teacher
    ? [teacher.first_name, teacher.last_name].filter(Boolean).join(' ') || 'Teacher'
    : 'Teacher';

  const questionIds = assignment.question_ids || [];

  // Fetch taxonomy and student status in parallel
  let questions = [];
  if (questionIds.length) {
    const [{ data: taxRows }, { data: statusRows }] = await Promise.all([
      supabase
        .from('question_taxonomy')
        .select('question_id, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
        .in('question_id', questionIds),
      supabase
        .from('question_status')
        .select('question_id, is_done, last_is_correct, attempts_count, correct_attempts_count')
        .eq('user_id', user.id)
        .in('question_id', questionIds),
    ]);

    const taxMap = {};
    for (const t of taxRows || []) taxMap[t.question_id] = t;
    const statusMap = {};
    for (const s of statusRows || []) statusMap[s.question_id] = s;

    questions = questionIds.map(qid => {
      const tax = taxMap[qid] || {};
      const status = statusMap[qid] || {};
      return {
        question_id: qid,
        domain_name: tax.domain_name || null,
        skill_name: tax.skill_name || null,
        difficulty: tax.difficulty || null,
        is_done: status.is_done || false,
        last_is_correct: status.last_is_correct || false,
        attempts_count: status.attempts_count || 0,
      };
    });
  }

  const isPracticeTest = assignment.filter_criteria?.type === 'practice_test';
  return NextResponse.json({
    assignment: {
      id: assignment.id,
      title: assignment.title,
      description: assignment.description,
      due_date: assignment.due_date,
      teacher_name: teacherName,
      created_at: assignment.created_at,
      practice_test_id: isPracticeTest ? assignment.filter_criteria.practice_test_id : null,
      sections: isPracticeTest ? (assignment.filter_criteria.sections || 'both') : null,
    },
    questions,
  });
});
