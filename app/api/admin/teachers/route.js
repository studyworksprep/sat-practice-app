import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/admin/teachers — list teachers (admins see all, managers see assigned)
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin' && profile?.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let teachers;
  if (profile.role === 'admin') {
    // Admins see all teachers and managers
    const { data } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, is_active, role')
      .in('role', ['teacher', 'manager'])
      .order('email', { ascending: true });
    teachers = data || [];
  } else {
    // Managers see only their assigned teachers
    const { data: mta } = await supabase
      .from('manager_teacher_assignments')
      .select('teacher_id')
      .eq('manager_id', user.id);

    const teacherIds = (mta || []).map(a => a.teacher_id);
    if (teacherIds.length === 0) {
      return NextResponse.json({ teachers: [] });
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, is_active, role')
      .in('id', teacherIds)
      .order('email', { ascending: true });
    teachers = data || [];
  }

  // Get student counts for these teachers
  const teacherIds = teachers.map(t => t.id);
  const { data: assignments } = teacherIds.length
    ? await supabase
        .from('teacher_student_assignments')
        .select('teacher_id, student_id')
        .in('teacher_id', teacherIds)
    : { data: [] };

  const assignmentsByTeacher = {};
  for (const a of assignments || []) {
    if (!assignmentsByTeacher[a.teacher_id]) assignmentsByTeacher[a.teacher_id] = [];
    assignmentsByTeacher[a.teacher_id].push(a.student_id);
  }

  const result = teachers.map(t => ({
    ...t,
    student_count: (assignmentsByTeacher[t.id] || []).length,
  }));

  return NextResponse.json({ teachers: result });
}
