import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

const ALLOWED_FIELDS = ['first_name', 'last_name', 'high_school', 'graduation_year', 'target_sat_score', 'start_date'];

// PATCH /api/teacher/student/[studentId]/profile
export const PATCH = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const { studentId } = params;

  const { user, profile, service: svc } = await requireServiceRole(
    'teacher patches student profile fields',
    { allowedRoles: ['teacher', 'manager', 'admin'] },
  );

  // For teachers, verify access to this student
  if (profile.role === 'teacher' || profile.role === 'manager') {
    const { data: assignment } = await svc
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('teacher_id', user.id)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!assignment) {
      const { data: classes } = await svc
        .from('classes')
        .select('id')
        .eq('teacher_id', user.id);

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
});
