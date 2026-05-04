import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

const ALLOWED_FIELDS = ['first_name', 'last_name', 'high_school', 'graduation_year', 'target_sat_score', 'start_date'];

// PATCH /api/teacher/student/[studentId]/profile
export const PATCH = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const { studentId } = params;

  const { supabase, service: svc } = await requireServiceRole(
    'teacher patches student profile fields',
    { allowedRoles: ['teacher', 'manager', 'admin'] },
  );

  // can_view covers admin, direct tutor->student, manager->tutor->student,
  // and class enrollments. Use the RLS-scoped client so auth.uid() resolves.
  const { data: canView } = await supabase.rpc('can_view', { target: studentId });
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
