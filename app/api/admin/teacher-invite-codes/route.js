import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import crypto from 'crypto';

function generateCode() {
  // 6 uppercase alphanumeric characters (no ambiguous chars: 0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// GET /api/admin/teacher-invite-codes
// Returns all teachers with their invite codes
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

  let { data: teachers, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name, teacher_invite_code')
    .in('role', ['teacher', 'manager', 'admin'])
    .order('last_name', { ascending: true });

  // If teacher_invite_code column doesn't exist yet, retry without it
  if (error && error.message?.includes('teacher_invite_code')) {
    const fallback = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .in('role', ['teacher', 'manager', 'admin'])
      .order('last_name', { ascending: true });
    teachers = (fallback.data || []).map(t => ({ ...t, teacher_invite_code: null }));
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ teachers: teachers || [] });
}

// POST /api/admin/teacher-invite-codes
// Generate or set an invite code for a teacher
// Body: { teacher_id, code? } — if code is omitted, one is auto-generated
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

  const body = await request.json();
  const { teacher_id, code } = body;

  if (!teacher_id) {
    return NextResponse.json({ error: 'teacher_id is required' }, { status: 400 });
  }

  const inviteCode = code?.trim().toUpperCase() || generateCode();

  // Check for uniqueness
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('teacher_invite_code', inviteCode)
    .neq('id', teacher_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'This code is already in use by another teacher.' }, { status: 409 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ teacher_invite_code: inviteCode })
    .eq('id', teacher_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ teacher_id, code: inviteCode });
}

// DELETE /api/admin/teacher-invite-codes
// Remove a teacher's invite code
// Body: { teacher_id }
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

  const body = await request.json();
  const { teacher_id } = body;

  if (!teacher_id) {
    return NextResponse.json({ error: 'teacher_id is required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ teacher_invite_code: null })
    .eq('id', teacher_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
