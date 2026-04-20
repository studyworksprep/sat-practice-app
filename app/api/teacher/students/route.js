import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/teacher/students — list students assigned to the current teacher (or all for admin)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role;
  if (role !== 'teacher' && role !== 'manager' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let studentIds = [];

  if (role === 'admin') {
    // Admin sees all active students
    const { data: allStudents } = await supabase
      .from('profiles')
      .select('id, email, role, created_at, first_name, last_name')
      .in('role', ['student', 'practice'])
      .neq('is_active', false)
      .order('email', { ascending: true });
    return NextResponse.json({ students: allStudents || [] });
  }

  // Teacher: get students from direct assignments
  const { data: assignments } = await supabase
    .from('teacher_student_assignments')
    .select('student_id')
    .eq('teacher_id', user.id);

  // Also get students from class enrollments
  const { data: classes } = await supabase
    .from('classes')
    .select('id')
    .eq('teacher_id', user.id);

  const classIds = (classes || []).map(c => c.id);
  let enrolledIds = [];
  if (classIds.length) {
    const { data: enrollments } = await supabase
      .from('class_enrollments')
      .select('student_id')
      .in('class_id', classIds);
    enrolledIds = (enrollments || []).map(e => e.student_id);
  }

  const directIds = (assignments || []).map(a => a.student_id);
  studentIds = [...new Set([...directIds, ...enrolledIds])];

  if (!studentIds.length) {
    return NextResponse.json({ students: [] });
  }

  const { data: students } = await supabase
    .from('profiles')
    .select('id, email, role, created_at, first_name, last_name')
    .in('id', studentIds)
    .neq('is_active', false)
    .order('email', { ascending: true });

  return NextResponse.json({ students: students || [] });
}
