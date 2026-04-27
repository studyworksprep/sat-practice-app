import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/teacher-codes — list all teacher codes
export const GET = legacyApiRoute(async () => {
  const { supabase } = await requireRole(['admin']);

  const { data, error } = await supabase
    .from('teacher_codes')
    .select('id, code, used_by, used_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ codes: data || [] });
});

// POST /api/admin/teacher-codes — create a new teacher code
// Body: { code } (optional — auto-generates if omitted)
export const POST = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const body = await request.json().catch(() => ({}));
  const code = (body.code || generateCode()).trim().toUpperCase();

  if (!code || code.length < 4) {
    return NextResponse.json({ error: 'Code must be at least 4 characters.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('teacher_codes')
    .insert({ code })
    .select('id, code, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'That code already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, code: data });
});

// DELETE /api/admin/teacher-codes — revoke (delete) a teacher code
// Body: { id }
export const DELETE = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('teacher_codes')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
});

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
