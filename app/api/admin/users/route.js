import { NextResponse } from 'next/server';
import { requireRole, requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/users
// Returns all profiles grouped by role
export const GET = legacyApiRoute(async () => {
  const { supabase } = await requireRole(['admin']);

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, role, is_active, created_at, high_school, graduation_year, target_sat_score, tutor_name')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ profiles: profiles || [] });
});

// PATCH /api/admin/users
// Body: { user_id, role?, is_active?, first_name?, last_name?, email?, high_school?, graduation_year?, target_sat_score?, tutor_name? }
export const PATCH = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

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
});

// DELETE /api/admin/users
// Body: { user_id }
// Permanently deletes the user's auth account and profile (cascade)
export const DELETE = legacyApiRoute(async (request) => {
  const { user, service: svc } = await requireServiceRole(
    'admin user deletion — needs auth.admin.deleteUser and cross-user profile delete',
    { allowedRoles: ['admin'] },
  );

  const { user_id } = await request.json();
  if (!user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  // Prevent admin from deleting themselves
  if (user_id === user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account.' }, { status: 400 });
  }

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
});
