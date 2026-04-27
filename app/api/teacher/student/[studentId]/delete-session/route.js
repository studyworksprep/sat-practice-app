import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// POST /api/teacher/student/[studentId]/delete-session
// Body: { attemptIds: [uuid, ...] }
// Deletes practice session attempt records for a student.
export const POST = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const { studentId } = params;
  const { supabase, profile, service } = await requireServiceRole(
    'teacher deletes student practice attempts',
    { allowedRoles: ['teacher', 'manager', 'admin'] },
  );

  // For teachers/managers, verify access to student
  if (profile.role === 'teacher' || profile.role === 'manager') {
    const { data: canView } = await supabase.rpc('teacher_can_view_student', {
      target_student_id: studentId,
    });
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden: student not in your roster' }, { status: 403 });
    }
  }

  const body = await request.json();
  const { attemptIds } = body;

  if (!Array.isArray(attemptIds) || attemptIds.length === 0) {
    return NextResponse.json({ error: 'attemptIds array is required' }, { status: 400 });
  }

  // Delete only attempts belonging to this student
  const { error, count } = await service
    .from('attempts')
    .delete({ count: 'exact' })
    .in('id', attemptIds)
    .eq('user_id', studentId);

  if (error) {
    return NextResponse.json({ error: `Failed to delete: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ deleted: count });
});
