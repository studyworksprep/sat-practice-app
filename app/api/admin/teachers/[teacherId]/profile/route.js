import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

const ALLOWED_FIELDS = ['first_name', 'last_name', 'high_school', 'teacher_invite_code'];

// PATCH /api/admin/teachers/[teacherId]/profile
export const PATCH = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const { teacherId } = params;
  const { supabase } = await requireRole(['manager', 'admin']);

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

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', teacherId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: updated } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, high_school, teacher_invite_code')
    .eq('id', teacherId)
    .maybeSingle();

  return NextResponse.json({ teacher: updated });
});
