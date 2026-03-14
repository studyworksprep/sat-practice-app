import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { assignmentId } = await params;

    if (!assignmentId) {
      return NextResponse.json({ error: "Assignment ID is required" }, { status: 400 });
    }

    // Fetch the assignment
    const { data: assignment, error: assignErr } = await supabase
      .from("question_assignments")
      .select("id, title, description, due_date, filter_criteria, question_ids, teacher_id, created_at")
      .eq("id", assignmentId)
      .single();

    if (assignErr || !assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    // Verify ownership (unless admin)
    if (profile.role !== "admin" && assignment.teacher_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch assigned students with profile info
    const { data: studentRows, error: studentsErr } = await supabase
      .from("question_assignment_students")
      .select("student_id, profiles(id, email, first_name, last_name)")
      .eq("assignment_id", assignmentId);

    if (studentsErr) {
      return NextResponse.json({ error: studentsErr.message }, { status: 500 });
    }

    const questionIds = assignment.question_ids || [];
    const totalQuestions = questionIds.length;

    // Build per-student progress
    const students = [];

    for (const row of studentRows || []) {
      const studentProfile = row.profiles;
      let completedCount = 0;
      let correctCount = 0;

      if (totalQuestions > 0) {
        // Get done count
        const { count: doneCount } = await supabase
          .from("question_status")
          .select("*", { count: "exact", head: true })
          .eq("user_id", row.student_id)
          .in("question_id", questionIds)
          .eq("is_done", true);

        completedCount = doneCount || 0;

        // Get correct count
        const { count: correctCnt } = await supabase
          .from("question_status")
          .select("*", { count: "exact", head: true })
          .eq("user_id", row.student_id)
          .in("question_id", questionIds)
          .eq("is_done", true)
          .eq("last_is_correct", true);

        correctCount = correctCnt || 0;
      }

      students.push({
        id: studentProfile.id,
        email: studentProfile.email,
        first_name: studentProfile.first_name,
        last_name: studentProfile.last_name,
        completed_count: completedCount,
        correct_count: correctCount,
        total_questions: totalQuestions,
      });
    }

    // Fetch taxonomy info for the question_ids
    let questions = [];

    if (totalQuestions > 0) {
      const { data: questionData } = await supabase
        .from("questions")
        .select("question_id, domain_name, skill_name, difficulty")
        .in("question_id", questionIds);

      questions = questionData || [];
    }

    return NextResponse.json({
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description,
        due_date: assignment.due_date,
        filter_criteria: assignment.filter_criteria,
        question_ids: assignment.question_ids,
        created_at: assignment.created_at,
      },
      students,
      questions,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
