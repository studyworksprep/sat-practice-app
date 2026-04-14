import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET — list all manager-teacher assignments
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: assignments, error } = await supabase
    .from('manager_teacher_assignments')
    .select('manager_id, teacher_id, created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: assignments || [] });
}

// POST — assign a teacher to a manager { manager_id, teacher_id }
export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { manager_id, teacher_id } = await request.json();
  if (!manager_id || !teacher_id) {
    return NextResponse.json({ error: 'manager_id and teacher_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('manager_teacher_assignments')
    .upsert({ manager_id, teacher_id }, { onConflict: 'manager_id,teacher_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a teacher-manager assignment { manager_id, teacher_id }
export async function DELETE(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { manager_id, teacher_id } = await request.json();
  if (!manager_id || !teacher_id) {
    return NextResponse.json({ error: 'manager_id and teacher_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('manager_teacher_assignments')
    .delete()
    .eq('manager_id', manager_id)
    .eq('teacher_id', teacher_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
