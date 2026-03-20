import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get assignments for this student
    const { data: assignmentRows, error: fetchErr } = await supabase
      .from("question_assignment_students")
      .select(
        "assignment_id, question_assignments(id, title, description, due_date, question_ids, teacher_id, filter_criteria)"
      )
      .eq("student_id", user.id);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const validRows = (assignmentRows || []).filter(r => r.question_assignments);
    if (validRows.length === 0) {
      return NextResponse.json({ assignments: [] });
    }

    // Batch fetch all teacher profiles at once
    const teacherIds = [...new Set(validRows.map(r => r.question_assignments.teacher_id).filter(Boolean))];
    const teacherMapPromise = teacherIds.length > 0
      ? supabase.from("profiles").select("id, first_name, last_name").in("id", teacherIds)
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

    // Build assignments without any additional queries
    const assignments = validRows.map(row => {
      const a = row.question_assignments;
      const questionIds = a.question_ids || [];
      const completedCount = questionIds.filter(qid => doneSet.has(qid)).length;
      const correctCount = questionIds.filter(qid => correctSet.has(qid)).length;

      const isPracticeTest = a.filter_criteria?.type === 'practice_test';
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        due_date: a.due_date,
        teacher_name: teacherMap[a.teacher_id] || "Unknown",
        question_count: questionIds.length,
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
}
