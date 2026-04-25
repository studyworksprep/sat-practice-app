import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/teacher/students — list students assigned to the current teacher (or all for admin)
export const GET = legacyApiRoute(async () => {
  const { supabase, user, profile } = await requireRole(['teacher', 'manager', 'admin']);
  const role = profile.role;

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
});
