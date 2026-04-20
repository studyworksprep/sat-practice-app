import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../../lib/supabase/server';

// POST /api/admin/questions-v2/approve
//
// Admin-only. Stamps approved_at = now() and approved_by = caller on
// every row whose id appears in the request body. Used by the
// "Approve batch" button in the Questions V2 Preview tab — the client
// sends the ids of every question currently visible on the page, and
// those rows then disappear from the default (unapproved-only) view.
//
// Idempotent: re-approving an already-approved row is a no-op apart
// from refreshing the timestamp and approver, which is fine.
//
// Body: { ids: string[] }  — UUIDs of questions_v2 rows to approve.
//
// DELETE /api/admin/questions-v2/approve
// Body: { ids: string[] }  — clears approved_at/approved_by on the
// listed rows. Used by an admin un-approving a question.
export async function POST(request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: 'too many ids (max 500)' }, { status: 400 });
  }

  const admin = createServiceClient();
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from('questions_v2')
    .update({ approved_at: nowIso, approved_by: user.id })
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, approved: ids.length, approved_at: nowIso });
}

export async function DELETE(request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
  }

  const admin = createServiceClient();
  const { error } = await admin
    .from('questions_v2')
    .update({ approved_at: null, approved_by: null })
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, unapproved: ids.length });
}
