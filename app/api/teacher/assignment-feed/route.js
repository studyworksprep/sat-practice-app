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

  // Batch fetch completion status
  // Avoid filtering by question_id in the query — with many assignments the ID list
  // can exceed PostgREST URL length limits and silently return empty results.
  // Instead, fetch all done statuses per student batch and filter in JS.
  const allQuestionIdSet = new Set(assignments.flatMap(a => a.question_ids || []));
  let statusRows = [];
  if (allQuestionIdSet.size && studentIds.length) {
    const BATCH = 20;
    for (let i = 0; i < studentIds.length; i += BATCH) {
      const studentBatch = studentIds.slice(i, i + BATCH);
      const { data } = await supabase
        .from('question_status')
        .select('user_id, question_id, is_done, last_is_correct, marked_for_review')
        .in('user_id', studentBatch)
        .eq('is_done', true)
        .limit(50000);
      if (data) {
        for (const row of data) {
          if (allQuestionIdSet.has(row.question_id)) statusRows.push(row);
        }
      }
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
  const allQuestionIds = [...allQuestionIdSet];
  let questionMeta = {};
  if (allQuestionIds.length > 0) {
    // Batch in chunks to avoid URL length limits with large question sets
    const { data: qMetaRows } = allQuestionIds.length <= 500
      ? await supabase
          .from('question_taxonomy')
          .select('question_id, difficulty, domain_name, skill_name')
          .in('question_id', allQuestionIds)
          .limit(10000)
      : await (async () => {
          const rows = [];
          for (let i = 0; i < allQuestionIds.length; i += 500) {
            const chunk = allQuestionIds.slice(i, i + 500);
            const { data } = await supabase
              .from('question_taxonomy')
              .select('question_id, difficulty, domain_name, skill_name')
              .in('question_id', chunk);
            if (data) rows.push(...data);
          }
          return { data: rows };
        })();
    for (const q of (qMetaRows || [])) {
      questionMeta[q.question_id] = q;
    }
  }

  // Fetch practice test completion for practice test assignments
  const ptAssignments = assignments.filter(a => a.filter_criteria?.type === 'practice_test');
  const ptTestIds = [...new Set(ptAssignments.map(a => a.filter_criteria?.practice_test_id).filter(Boolean))];
  const ptCompletionByUserTest = {}; // `${user_id}:${test_id}` → { completed, score }

  if (ptTestIds.length && studentIds.length) {
    const { data: ptAttempts } = await supabase
      .from('practice_test_attempts')
      .select('user_id, practice_test_id, status, composite_score, rw_scaled, math_scaled')
      .in('user_id', studentIds)
      .in('practice_test_id', ptTestIds)
      .eq('status', 'completed')
      .limit(5000);

    for (const pt of ptAttempts || []) {
      const key = `${pt.user_id}:${pt.practice_test_id}`;
      // Keep the best score if multiple completions
      if (!ptCompletionByUserTest[key] || (pt.composite_score || 0) > (ptCompletionByUserTest[key].score || 0)) {
        ptCompletionByUserTest[key] = {
          completed: true,
          score: pt.composite_score,
          rw_scaled: pt.rw_scaled,
          math_scaled: pt.math_scaled,
        };
      }
    }
  }

  // Build rows
  const rows = studentAssignments.map(sa => {
    const a = assignmentMap[sa.assignment_id];
    if (!a) return null;

    const isPracticeTest = a.filter_criteria?.type === 'practice_test';

    if (isPracticeTest) {
      const testId = a.filter_criteria?.practice_test_id;
      const ptKey = `${sa.student_id}:${testId}`;
      const ptResult = ptCompletionByUserTest[ptKey];

      return {
        assignment_id: a.id,
        title: a.title,
        due_date: a.due_date,
        completed_at: a.completed_at || null,
        question_ids: [],
        question_count: 1, // Treat practice test as 1 "item"
        completed_count: ptResult?.completed ? 1 : 0,
        student_id: sa.student_id,
        student_name: studentMap[sa.student_id] || '—',
        is_practice_test: true,
        practice_test_id: testId,
        test_score: ptResult?.score || null,
        rw_scaled: ptResult?.rw_scaled || null,
        math_scaled: ptResult?.math_scaled || null,
        question_statuses: [],
      };
    }

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
