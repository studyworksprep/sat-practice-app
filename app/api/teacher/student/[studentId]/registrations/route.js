import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

async function verifyTeacherAccess(supabase, profile, userId, studentId) {
  if (profile.role === 'teacher' || profile.role === 'manager') {
    const { data: assignment } = await supabase
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('teacher_id', userId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!assignment) {
      const { data: classes } = await supabase.from('classes').select('id').eq('teacher_id', userId);
      const classIds = (classes || []).map(c => c.id);
      if (classIds.length) {
        const { data: enrollment } = await supabase
          .from('class_enrollments')
          .select('student_id')
          .in('class_id', classIds)
          .eq('student_id', studentId)
          .maybeSingle();
        if (!enrollment) return false;
      } else {
        return false;
      }
    }
  }
  return true;
}

// GET /api/teacher/student/[studentId]/registrations
export const GET = legacyApiRoute(async (_request, props) => {
  const params = await props.params;
  const { studentId } = params;
  const { supabase, user, profile } = await requireRole(['teacher', 'manager', 'admin']);

  if (!(await verifyTeacherAccess(supabase, profile, user.id, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: registrations } = await supabase
    .from('sat_test_registrations')
    .select('id, test_date, created_at')
    .eq('student_id', studentId)
    .order('test_date', { ascending: true });

  return NextResponse.json({ registrations: registrations || [] });
});

// POST /api/teacher/student/[studentId]/registrations
export const POST = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const { studentId } = params;
  const { supabase, user, profile } = await requireRole(['teacher', 'manager', 'admin']);

  if (!(await verifyTeacherAccess(supabase, profile, user.id, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  if (!body.test_date) {
    return NextResponse.json({ error: 'test_date is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('sat_test_registrations')
    .insert({ student_id: studentId, test_date: body.test_date, created_by: user.id })
    .select('id, test_date, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ registration: data });
});

// DELETE /api/teacher/student/[studentId]/registrations
export const DELETE = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const { studentId } = params;
  const { supabase, user, profile } = await requireRole(['teacher', 'manager', 'admin']);

  if (!(await verifyTeacherAccess(supabase, profile, user.id, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase
    .from('sat_test_registrations')
    .delete()
    .eq('id', id)
    .eq('student_id', studentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
});
