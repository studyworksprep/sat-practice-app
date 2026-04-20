import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';

async function verifyTeacherAccess(supabase, userId, studentId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role !== 'teacher' && profile?.role !== 'manager' && profile?.role !== 'admin') return false;

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
export async function GET(_request, props) {
  const params = await props.params;
  const { studentId } = params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await verifyTeacherAccess(supabase, user.id, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: registrations } = await supabase
    .from('sat_test_registrations')
    .select('id, test_date, created_at')
    .eq('student_id', studentId)
    .order('test_date', { ascending: true });

  return NextResponse.json({ registrations: registrations || [] });
}

// POST /api/teacher/student/[studentId]/registrations
export async function POST(request, props) {
  const params = await props.params;
  const { studentId } = params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await verifyTeacherAccess(supabase, user.id, studentId))) {
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
}

// DELETE /api/teacher/student/[studentId]/registrations
export async function DELETE(request, props) {
  const params = await props.params;
  const { studentId } = params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await verifyTeacherAccess(supabase, user.id, studentId))) {
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
}
