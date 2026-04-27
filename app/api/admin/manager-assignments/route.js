import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET — list all manager-teacher assignments
export const GET = legacyApiRoute(async () => {
  const { supabase } = await requireRole(['admin']);

  const { data: assignments, error } = await supabase
    .from('manager_teacher_assignments')
    .select('manager_id, teacher_id, created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignments: assignments || [] });
});

// POST — assign a teacher to a manager { manager_id, teacher_id }
export const POST = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const { manager_id, teacher_id } = await request.json();
  if (!manager_id || !teacher_id) {
    return NextResponse.json({ error: 'manager_id and teacher_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('manager_teacher_assignments')
    .upsert({ manager_id, teacher_id }, { onConflict: 'manager_id,teacher_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});

// DELETE — remove a teacher-manager assignment { manager_id, teacher_id }
export const DELETE = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

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
});
