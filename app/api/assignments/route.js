import { NextResponse } from "next/server";
import { createServiceClient } from "../../../lib/supabase/server";
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

export const GET = legacyApiRoute(async () => {
  // Auth happens outside the try/catch so a 401 from requireUser propagates
  // to legacyApiRoute as a 401 (instead of being caught and remapped to 500).
  const { user, supabase } = await requireUser();
  try {
    // Get assignments for this student
    let { data: assignmentRows, error: fetchErr } = await supabase
      .from("question_assignment_students")
      .select(
        "assignment_id, question_assignments(id, title, description, due_date, question_ids, teacher_id, filter_criteria)"
      )
      .eq("student_id", user.id);

    // Retry without filter_criteria if column doesn't exist yet
    if (fetchErr) {
      const fallback = await supabase
        .from("question_assignment_students")
        .select(
          "assignment_id, question_assignments(id, title, description, due_date, question_ids, teacher_id)"
        )
        .eq("student_id", user.id);
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      }
      assignmentRows = fallback.data;
    }

    const validRows = (assignmentRows || []).filter(r => r.question_assignments);
    if (validRows.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    // Batch fetch all teacher profiles at once
    const teacherIds = [...new Set(validRows.map(r => r.question_assignments.teacher_id).filter(Boolean))];
    // Use service client to fetch teacher profiles — students can't read teacher
    // profiles through RLS (profiles_select only allows teacher→student, not reverse)
    const svc = createServiceClient();
    const teacherMapPromise = teacherIds.length > 0
      ? svc.from("profiles").select("id, first_name, last_name").in("id", teacherIds)
      : Promise.resolve({ data: [] });

    // Collect all question IDs across all assignments for batch status query
    const allQuestionIds = [];
    for (const row of validRows) {
      const qids = row.question_assignments.question_ids || [];
      for (const qid of qids) {
        if (!allQuestionIds.includes(qid)) allQuestionIds.push(qid);
      }
    }

    // Batch fetch all question statuses at once (instead of per-assignment)
    const statusPromise = allQuestionIds.length > 0
      ? supabase
          .from("question_status")
          .select("question_id, is_done, last_is_correct")
          .eq("user_id", user.id)
          .in("question_id", allQuestionIds)
          .eq("is_done", true)
          .limit(5000)
      : Promise.resolve({ data: [] });

    const [{ data: teacherProfiles }, { data: statusRows }] = await Promise.all([
      teacherMapPromise,
      statusPromise,
    ]);

    // Build teacher lookup
    const teacherMap = {};
    for (const t of (teacherProfiles || [])) {
      teacherMap[t.id] = `${t.first_name || ""} ${t.last_name || ""}`.trim() || "Unknown";
    }

    // Build status lookups
    const doneSet = new Set();
    const correctSet = new Set();
    for (const s of (statusRows || [])) {
      doneSet.add(s.question_id);
      if (s.last_is_correct) correctSet.add(s.question_id);
    }

    // Check practice test completion for PT assignments
    const ptTestIds = [...new Set(
      validRows
        .map(r => r.question_assignments?.filter_criteria?.practice_test_id)
        .filter(Boolean)
    )];
    const ptCompletedSet = new Set();
    if (ptTestIds.length) {
      const { data: ptAttempts } = await supabase
        .from('practice_test_attempts')
        .select('practice_test_id')
        .eq('user_id', user.id)
        .in('practice_test_id', ptTestIds)
        .eq('status', 'completed')
        .limit(100);
      for (const pt of ptAttempts || []) {
        ptCompletedSet.add(pt.practice_test_id);
      }
    }

    // Build assignments
    const assignments = validRows.map(row => {
      const a = row.question_assignments;
      const questionIds = a.question_ids || [];
      const isPracticeTest = a.filter_criteria?.type === 'practice_test';

      let completedCount, correctCount, questionCount;
      if (isPracticeTest) {
        const testId = a.filter_criteria.practice_test_id;
        questionCount = 1;
        completedCount = ptCompletedSet.has(testId) ? 1 : 0;
        correctCount = 0;
      } else {
        questionCount = questionIds.length;
        completedCount = questionIds.filter(qid => doneSet.has(qid)).length;
        correctCount = questionIds.filter(qid => correctSet.has(qid)).length;
      }

      return {
        id: a.id,
        title: a.title,
        description: a.description,
        due_date: a.due_date,
        teacher_name: teacherMap[a.teacher_id] || "Unknown",
        question_count: questionCount,
        completed_count: completedCount,
        correct_count: correctCount,
        practice_test_id: isPracticeTest ? a.filter_criteria.practice_test_id : null,
        sections: isPracticeTest ? (a.filter_criteria.sections || 'both') : null,
      };
    });

    return NextResponse.json({ assignments });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});
