import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/admin/teachers — list all teachers with student counts and activity summary
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all teachers
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, created_at, is_active')
    .eq('role', 'teacher')
    .order('email', { ascending: true });

  // Get all teacher-student assignments
  const { data: assignments } = await supabase
    .from('teacher_student_assignments')
    .select('teacher_id, student_id');

  const assignmentsByTeacher = {};
  for (const a of assignments || []) {
    if (!assignmentsByTeacher[a.teacher_id]) assignmentsByTeacher[a.teacher_id] = [];
    assignmentsByTeacher[a.teacher_id].push(a.student_id);
  }

  const result = (teachers || []).map(t => ({
    ...t,
    student_count: (assignmentsByTeacher[t.id] || []).length,
  }));

  return NextResponse.json({ teachers: result });
}
