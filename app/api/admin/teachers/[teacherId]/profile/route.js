import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';

const ALLOWED_FIELDS = ['first_name', 'last_name', 'high_school', 'teacher_invite_code'];

// PATCH /api/admin/teachers/[teacherId]/profile
export async function PATCH(request, props) {
  const params = await props.params;
  const { teacherId } = params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin' && profile?.role !== 'manager') {
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
}
