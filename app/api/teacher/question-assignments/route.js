import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET(request) {
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

    // Pagination params
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "10", 10)));
    const offset = (page - 1) * pageSize;

    // Optional status filter: 'complete' or 'incomplete'
    const statusFilter = searchParams.get("status");

    // Get total count first
    let countQuery = supabase
      .from("question_assignments")
      .select("id", { count: "exact", head: true });

    if (profile.role !== "admin") {
      countQuery = countQuery.eq("teacher_id", user.id);
    }
    if (statusFilter === "complete") {
      countQuery = countQuery.not("completed_at", "is", null);
    } else if (statusFilter === "incomplete") {
      countQuery = countQuery.is("completed_at", null);
    }

    const { count: totalCount } = await countQuery;

    // Fetch paginated assignments
    // Try with new columns first; fall back if they don't exist yet (migration not run)
    let query = supabase
      .from("question_assignments")
      .select("id, title, description, due_date, question_ids, created_at, completed_at, filter_criteria")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (profile.role !== "admin") {
      query = query.eq("teacher_id", user.id);
    }
    if (statusFilter === "complete") {
      query = query.not("completed_at", "is", null);
    } else if (statusFilter === "incomplete") {
      query = query.is("completed_at", null);
    }

    let { data: assignments, error: assignErr } = await query;

    if (assignErr) {
      // Retry without new columns if they don't exist yet
      let fallbackQuery = supabase
        .from("question_assignments")
        .select("id, title, description, due_date, question_ids, created_at")
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (profile.role !== "admin") {
        fallbackQuery = fallbackQuery.eq("teacher_id", user.id);
      }

      const fallback = await fallbackQuery;
      if (fallback.error) {
        return NextResponse.json({ error: fallback.error.message }, { status: 500 });
      }
      assignments = fallback.data;
    }

    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ assignments: [], totalCount: totalCount || 0, page, pageSize });
    }

    // Batch: fetch all student assignments for this page's assignments in one query
    const assignmentIds = assignments.map((a) => a.id);
    const { data: allStudentAssigns } = await supabase
      .from("question_assignment_students")
      .select("assignment_id, student_id")
      .in("assignment_id", assignmentIds);

    // Group students by assignment
    const studentsByAssignment = {};
    for (const sa of allStudentAssigns || []) {
      if (!studentsByAssignment[sa.assignment_id]) studentsByAssignment[sa.assignment_id] = [];
      studentsByAssignment[sa.assignment_id].push(sa.student_id);
    }

    // Batch: collect all unique (student_id, question_id) pairs to query completion
    const allStudentIds = [...new Set((allStudentAssigns || []).map((sa) => sa.student_id))];
    const allQuestionIds = [...new Set(assignments.flatMap((a) => a.question_ids || []))];

    // Fetch student names for display
    let studentNameMap = {};
    if (allStudentIds.length > 0) {
      const { data: studentProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", allStudentIds);
      for (const s of studentProfiles || []) {
        studentNameMap[s.id] = [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email || "—";
      }
    }

    // Get done counts in batch (only if we have students and questions)
    let doneByUserQuestion = {};
    if (allStudentIds.length > 0 && allQuestionIds.length > 0) {
      // Query in chunks if needed
      for (let i = 0; i < allQuestionIds.length; i += 1000) {
        const qChunk = allQuestionIds.slice(i, i + 1000);
        const { data: doneStatuses } = await supabase
          .from("question_status")
          .select("user_id, question_id")
          .in("user_id", allStudentIds)
          .in("question_id", qChunk)
          .eq("is_done", true);

        for (const s of doneStatuses || []) {
          const key = `${s.user_id}:${s.question_id}`;
          doneByUserQuestion[key] = true;
        }
      }
    }

    // Build enriched assignment list
    const enriched = assignments.map((a) => {
      const questionCount = a.question_ids ? a.question_ids.length : 0;
      const studentIds = studentsByAssignment[a.id] || [];
      const studentCount = studentIds.length;

      let avgCompletionPct = 0;
      if (studentCount > 0 && questionCount > 0) {
        let doneCount = 0;
        for (const sid of studentIds) {
          for (const qid of a.question_ids) {
            if (doneByUserQuestion[`${sid}:${qid}`]) doneCount++;
          }
        }
        const totalPossible = studentCount * questionCount;
        avgCompletionPct = Math.round((doneCount / totalPossible) * 100);
      }

      const isPracticeTest = a.filter_criteria?.type === 'practice_test';
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        due_date: a.due_date,
        question_count: questionCount,
        student_count: studentCount,
        student_names: studentIds.map(sid => studentNameMap[sid] || "—"),
        avg_completion_pct: isPracticeTest ? null : avgCompletionPct,
        created_at: a.created_at,
        completed_at: a.completed_at || null,
        practice_test_id: isPracticeTest ? a.filter_criteria.practice_test_id : null,
        sections: isPracticeTest ? (a.filter_criteria.sections || 'both') : null,
      };
    });

    return NextResponse.json({
      assignments: enriched,
      totalCount: totalCount || 0,
      page,
      pageSize,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
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

    const body = await request.json();
    const { title, description, due_date, question_ids, student_ids, filter_criteria } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Practice test assignments have empty question_ids; question assignments require them
    const isPracticeTest = filter_criteria?.type === 'practice_test';
    if (!isPracticeTest && (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0)) {
      return NextResponse.json(
        { error: "question_ids must be a non-empty array" },
        { status: 400 }
      );
    }

    // Insert assignment
    const { data: assignment, error: insertErr } = await supabase
      .from("question_assignments")
      .insert({
        teacher_id: user.id,
        title: title.trim(),
        description: description || null,
        due_date: due_date || null,
        filter_criteria: filter_criteria || null,
        question_ids,
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Insert student assignments
    if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
      const studentRows = student_ids.map((sid) => ({
        assignment_id: assignment.id,
        student_id: sid,
      }));

      const { error: studentsErr } = await supabase
        .from("question_assignment_students")
        .insert(studentRows);

      if (studentsErr) {
        return NextResponse.json({ error: studentsErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, id: assignment.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
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

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Assignment id is required" }, { status: 400 });
    }

    // Verify ownership (unless admin)
    if (profile.role !== "admin") {
      const { data: existing } = await supabase
        .from("question_assignments")
        .select("teacher_id")
        .eq("id", id)
        .single();

      if (!existing || existing.teacher_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const { error: deleteErr } = await supabase
      .from("question_assignments")
      .delete()
      .eq("id", id);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "teacher" && profile.role !== "manager" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: "Assignment id is required" }, { status: 400 });
    }

    // Verify ownership (unless admin)
    if (profile.role !== "admin") {
      const { data: existing } = await supabase
        .from("question_assignments")
        .select("teacher_id")
        .eq("id", id)
        .single();

      if (!existing || existing.teacher_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (action === "complete") {
      const { error: updateErr } = await supabase
        .from("question_assignments")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", id);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    } else if (action === "reopen") {
      const { error: updateErr } = await supabase
        .from("question_assignments")
        .update({ completed_at: null })
        .eq("id", id);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
