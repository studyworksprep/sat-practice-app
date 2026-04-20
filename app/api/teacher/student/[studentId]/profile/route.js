import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../../../lib/supabase/server';

const ALLOWED_FIELDS = ['first_name', 'last_name', 'high_school', 'graduation_year', 'target_sat_score', 'start_date'];

// PATCH /api/teacher/student/[studentId]/profile
export async function PATCH(request, props) {
  const params = await props.params;
  const { studentId } = params;

  // Prefer middleware-provided user ID (avoids stale-cookie auth issues)
  const userId = request.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const svc = createServiceClient();

  const { data: profile } = await svc
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role !== 'teacher' && profile?.role !== 'manager' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // For teachers, verify access to this student
  if (profile.role === 'teacher' || profile.role === 'manager') {
    const { data: assignment } = await svc
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('teacher_id', userId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!assignment) {
      const { data: classes } = await svc
        .from('classes')
        .select('id')
        .eq('teacher_id', userId);

      const classIds = (classes || []).map(c => c.id);
      let hasAccess = false;
      if (classIds.length) {
        const { data: enrollment } = await svc
          .from('class_enrollments')
          .select('student_id')
          .in('class_id', classIds)
          .eq('student_id', studentId)
          .maybeSingle();
        hasAccess = !!enrollment;
      }

      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  const body = await request.json();
  const updates = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      updates[key] = body[key] === '' ? null : body[key];
    }
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  // Convert graduation_year and target_sat_score to numbers if present
  if (updates.graduation_year != null) updates.graduation_year = Number(updates.graduation_year) || null;
  if (updates.target_sat_score != null) updates.target_sat_score = Number(updates.target_sat_score) || null;
  const { error } = await svc
    .from('profiles')
    .update(updates)
    .eq('id', studentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return updated profile
  const { data: updated } = await svc
    .from('profiles')
    .select('id, email, first_name, last_name, high_school, graduation_year, target_sat_score, start_date')
    .eq('id', studentId)
    .maybeSingle();

  return NextResponse.json({ student: updated });
}
