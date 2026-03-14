import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export async function GET() {
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

    if (!profile || (profile.role !== "teacher" && profile.role !== "manager" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch assignments
    let query = supabase
      .from("question_assignments")
      .select("id, title, description, due_date, question_ids, created_at")
      .order("created_at", { ascending: false });

    if (profile.role !== "admin") {
      query = query.eq("teacher_id", user.id);
    }

    const { data: assignments, error: assignErr } = await query;

    if (assignErr) {
      return NextResponse.json({ error: assignErr.message }, { status: 500 });
    }

    // Build enriched assignment list
    const enriched = [];

    for (const a of assignments) {
      const questionCount = a.question_ids ? a.question_ids.length : 0;

      // Count students
      const { count: studentCount } = await supabase
        .from("question_assignment_students")
        .select("*", { count: "exact", head: true })
        .eq("assignment_id", a.id);

      // Compute average completion
      let avgCompletionPct = 0;

      if (studentCount > 0 && questionCount > 0) {
        // Get all assigned student ids
        const { data: studentRows } = await supabase
          .from("question_assignment_students")
          .select("student_id")
          .eq("assignment_id", a.id);

        const studentIds = studentRows.map((s) => s.student_id);

        // Query question_status for these students and question_ids where is_done = true
        const { count: doneCount } = await supabase
          .from("question_status")
          .select("*", { count: "exact", head: true })
          .in("user_id", studentIds)
          .in("question_id", a.question_ids)
          .eq("is_done", true);

        const totalPossible = studentCount * questionCount;
        avgCompletionPct =
          totalPossible > 0
            ? Math.round(((doneCount || 0) / totalPossible) * 100)
            : 0;
      }

      enriched.push({
        id: a.id,
        title: a.title,
        description: a.description,
        due_date: a.due_date,
        question_count: questionCount,
        student_count: studentCount || 0,
        avg_completion_pct: avgCompletionPct,
        created_at: a.created_at,
      });
    }

    return NextResponse.json({ assignments: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
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

    if (!profile || (profile.role !== "teacher" && profile.role !== "manager" && profile.role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, due_date, question_ids, student_ids, filter_criteria } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!question_ids || !Array.isArray(question_ids) || question_ids.length === 0) {
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
