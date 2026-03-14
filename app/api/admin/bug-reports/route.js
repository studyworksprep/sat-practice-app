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

// GET /api/admin/bug-reports — list all bug reports
export async function GET(request) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  const { data, error } = await supabase
    .from('bug_reports')
    .select('id, title, description, image_url, status, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ reports: data || [] });
}

// POST /api/admin/bug-reports — create a new bug report
export async function POST(request) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const { title, description, image_data } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
  }

  const row = {
    title: (title || '').trim() || 'Bug Report',
    description: description.trim(),
    image_url: image_data || null,
    status: 'open',
    created_by: auth.user.email,
  };

  const { data, error } = await supabase
    .from('bug_reports')
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ report: data });
}

// PATCH /api/admin/bug-reports — update status
export async function PATCH(request) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, status } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { error } = await supabase
    .from('bug_reports')
    .update({ status })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/bug-reports — delete a bug report
export async function DELETE(request) {
  const supabase = createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase.from('bug_reports').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
