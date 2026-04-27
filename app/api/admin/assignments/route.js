import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/assignments — list all teacher-student assignments
export const GET = legacyApiRoute(async () => {
  const { supabase } = await requireRole(['admin']);

  const { data, error } = await supabase
    .from('teacher_student_assignments')
    .select('teacher_id, student_id, created_at')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ assignments: data || [] });
});

// POST /api/admin/assignments — assign student to teacher
// Body: { teacher_id, student_id }
export const POST = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const { teacher_id, student_id } = await request.json();
  if (!teacher_id || !student_id) {
    return NextResponse.json({ error: 'teacher_id and student_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('teacher_student_assignments')
    .insert({ teacher_id, student_id });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Assignment already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});

// DELETE /api/admin/assignments — remove assignment
// Body: { teacher_id, student_id }
export const DELETE = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const { teacher_id, student_id } = await request.json();
  if (!teacher_id || !student_id) {
    return NextResponse.json({ error: 'teacher_id and student_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('teacher_student_assignments')
    .delete()
    .eq('teacher_id', teacher_id)
    .eq('student_id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});
