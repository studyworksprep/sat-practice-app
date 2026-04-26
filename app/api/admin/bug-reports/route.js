import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/bug-reports — list all bug reports
export const GET = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  const { data, error } = await supabase
    .from('bug_reports')
    .select('id, title, description, image_url, status, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ reports: data || [] });
});

// POST /api/admin/bug-reports — create a new bug report
export const POST = legacyApiRoute(async (request) => {
  const { user, supabase } = await requireRole(['admin']);

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
    created_by: user.email,
  };

  const { data, error } = await supabase
    .from('bug_reports')
    .insert(row)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ report: data });
});

// PATCH /api/admin/bug-reports — update status
export const PATCH = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

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
});

// DELETE /api/admin/bug-reports — delete a bug report
export const DELETE = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabase.from('bug_reports').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
});
