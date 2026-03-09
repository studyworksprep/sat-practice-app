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
        "assignment_id, question_assignments(id, title, description, due_date, question_ids, teacher_id)"
      )
      .eq("student_id", user.id);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const assignments = [];

    for (const row of assignmentRows || []) {
      const a = row.question_assignments;
      if (!a) continue;

      // Get teacher name
      const { data: teacherProfile } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", a.teacher_id)
        .single();

      const teacherName = teacherProfile
        ? `${teacherProfile.first_name || ""} ${teacherProfile.last_name || ""}`.trim()
        : "Unknown";

      const questionIds = a.question_ids || [];
      const questionCount = questionIds.length;
      let completedCount = 0;
      let correctCount = 0;

      if (questionCount > 0) {
        // Get completed count
        const { count: doneCount } = await supabase
          .from("question_status")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("question_id", questionIds)
          .eq("is_done", true);

        completedCount = doneCount || 0;

        // Get correct count
        const { count: correctCnt } = await supabase
          .from("question_status")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .in("question_id", questionIds)
          .eq("is_done", true)
          .eq("is_correct", true);

        correctCount = correctCnt || 0;
      }

      assignments.push({
        id: a.id,
        title: a.title,
        description: a.description,
        due_date: a.due_date,
        teacher_name: teacherName,
        question_count: questionCount,
        completed_count: completedCount,
        correct_count: correctCount,
      });
    }

    return NextResponse.json({ assignments });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
