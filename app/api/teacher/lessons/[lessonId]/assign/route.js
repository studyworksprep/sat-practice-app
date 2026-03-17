import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';

// POST /api/teacher/lessons/[lessonId]/assign — assign a lesson to students
// Body: { student_ids: string[], due_date?: string }
export async function POST(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['teacher', 'manager', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lessonId } = params;
    const body = await request.json();
    const { student_ids, due_date } = body;

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json({ error: 'student_ids must be a non-empty array' }, { status: 400 });
    }

    // Verify lesson exists
    const { data: lesson } = await supabase
      .from('lessons')
      .select('id')
      .eq('id', lessonId)
      .maybeSingle();

    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    // Create assignment
    const { data: assignment, error: assignErr } = await supabase
      .from('lesson_assignments')
      .insert({
        teacher_id: user.id,
        lesson_id: lessonId,
        due_date: due_date || null,
      })
      .select('id')
      .single();

    if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 });

    // Assign students
    const studentRows = student_ids.map(sid => ({
      assignment_id: assignment.id,
      student_id: sid,
    }));

    const { error: studentsErr } = await supabase
      .from('lesson_assignment_students')
      .insert(studentRows);

    if (studentsErr) return NextResponse.json({ error: studentsErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, assignment_id: assignment.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/teacher/lessons/[lessonId]/assign — get assignment info for a lesson
export async function GET(request, { params }) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['teacher', 'manager', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { lessonId } = params;

    // Get assignments for this lesson by this teacher
    const { data: assignments } = await supabase
      .from('lesson_assignments')
      .select('id, due_date, created_at')
      .eq('lesson_id', lessonId)
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    // For each assignment, get students and their progress
    const enriched = [];
    for (const a of assignments || []) {
      const { data: students } = await supabase
        .from('lesson_assignment_students')
        .select('student_id')
        .eq('assignment_id', a.id);

      const studentIds = (students || []).map(s => s.student_id);

      let studentDetails = [];
      if (studentIds.length > 0) {
        const [profilesRes, progressRes] = await Promise.all([
          supabase.from('profiles').select('id, first_name, last_name').in('id', studentIds),
          supabase.from('lesson_progress').select('student_id, completed_at, completed_blocks').eq('lesson_id', lessonId).in('student_id', studentIds),
        ]);

        const progressMap = {};
        for (const p of progressRes.data || []) {
          progressMap[p.student_id] = p;
        }

        studentDetails = (profilesRes.data || []).map(s => ({
          id: s.id,
          name: [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Unknown',
          completed: !!progressMap[s.id]?.completed_at,
          blocks_completed: (progressMap[s.id]?.completed_blocks || []).length,
        }));
      }

      enriched.push({
        ...a,
        students: studentDetails,
      });
    }

    return NextResponse.json({ assignments: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
