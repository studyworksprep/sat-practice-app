import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";

export async function GET(request, { params }) {
  try {
    const supabase = await createClient();
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

    if (!profile || (profile.role !== "teacher" && profile.role !== "manager" && profile.role !== "admin")) {
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

    // Batch-fetch all question_status rows for all students at once
    const allStudentIds = (studentRows || []).map(r => r.student_id);
    let statusByStudentQuestion = {};
    if (allStudentIds.length > 0 && totalQuestions > 0) {
      for (let i = 0; i < questionIds.length; i += 1000) {
        const qChunk = questionIds.slice(i, i + 1000);
        const { data: statuses } = await supabase
          .from("question_status")
          .select("user_id, question_id, is_done, last_is_correct, marked_for_review, attempts_count")
          .in("user_id", allStudentIds)
          .in("question_id", qChunk);
        for (const s of statuses || []) {
          statusByStudentQuestion[`${s.user_id}:${s.question_id}`] = s;
        }
      }
    }

    // Build per-student progress
    const students = [];

    for (const row of studentRows || []) {
      const studentProfile = row.profiles;
      let completedCount = 0;
      let correctCount = 0;
      const questionStatuses = [];

      for (const qid of questionIds) {
        const qs = statusByStudentQuestion[`${row.student_id}:${qid}`];
        if (qs?.is_done) {
          completedCount++;
          if (qs.last_is_correct) correctCount++;
        }
        questionStatuses.push({
          question_id: qid,
          is_done: qs?.is_done || false,
          last_is_correct: qs?.last_is_correct || false,
          marked_for_review: qs?.marked_for_review || false,
          attempts_count: qs?.attempts_count || 0,
        });
      }

      students.push({
        id: studentProfile.id,
        email: studentProfile.email,
        first_name: studentProfile.first_name,
        last_name: studentProfile.last_name,
        completed_count: completedCount,
        correct_count: correctCount,
        total_questions: totalQuestions,
        question_statuses: questionStatuses,
      });
    }

    // Fetch taxonomy info for the question_ids
    let questions = [];

    if (totalQuestions > 0) {
      const { data: questionData } = await supabase
        .from("question_taxonomy")
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
