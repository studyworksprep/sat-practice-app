import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

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

// GET /api/admin/teacher-codes — list all teacher codes
export async function GET() {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await supabase
    .from('teacher_codes')
    .select('id, code, used_by, used_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ codes: data || [] });
}

// POST /api/admin/teacher-codes — create a new teacher code
// Body: { code } (optional — auto-generates if omitted)
export async function POST(request) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
}

// DELETE /api/admin/teacher-codes — revoke (delete) a teacher code
// Body: { id }
export async function DELETE(request) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('teacher_codes')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
