import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// can_view covers admin, direct tutor->student, manager->tutor->student,
// and class enrollments. Previous inline implementation missed managers.
async function verifyTeacherAccess(supabase, _profile, _userId, studentId) {
  const { data } = await supabase.rpc('can_view', { target: studentId });
  return !!data;
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
