import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

async function requireAdmin(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 };
  return { user };
}

// GET /api/admin/users
// Returns all profiles grouped by role
export async function GET() {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role, is_active, created_at, high_school, graduation_year, target_sat_score, tutor_name')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profiles: profiles || [] });
}

// PATCH /api/admin/users
// Body: { user_id, role?, is_active?, first_name?, last_name?, email?, high_school?, graduation_year?, target_sat_score?, tutor_name? }
export async function PATCH(request) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const { user_id, role, is_active, first_name, last_name, email, high_school, graduation_year, target_sat_score, tutor_name } = body;

  if (!user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  const updates = {};

  if (role !== undefined) {
    const validRoles = ['practice', 'student', 'teacher', 'manager', 'admin'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    updates.role = role;
  }

  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  // Profile fields
  const STRING_FIELDS = ['first_name', 'last_name', 'email', 'high_school', 'tutor_name'];
  for (const field of STRING_FIELDS) {
    if (body[field] !== undefined) updates[field] = body[field] || null;
  }
  if (graduation_year !== undefined) updates.graduation_year = graduation_year ? Number(graduation_year) : null;
  if (target_sat_score !== undefined) updates.target_sat_score = target_sat_score ? Number(target_sat_score) : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users
// Body: { user_id }
// Permanently deletes the user's auth account and profile (cascade)
export async function DELETE(request) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { user_id } = await request.json();
  if (!user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  // Prevent admin from deleting themselves
  if (user_id === auth.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account.' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Delete the auth user — the profiles row will cascade-delete if the FK
  // is set to ON DELETE CASCADE, otherwise we delete it explicitly first.
  const { error: profileErr } = await svc
    .from('profiles')
    .delete()
    .eq('id', user_id);

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 400 });
  }

  const { error: authErr } = await svc.auth.admin.deleteUser(user_id);

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
