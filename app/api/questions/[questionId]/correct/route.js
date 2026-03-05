import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../../lib/supabase/server';

// POST /api/questions/:questionId/correct
// Admin-only: update question content fields and flag as broken.
export async function POST(request, { params }) {
  const questionId = params.questionId;
  const supabase = createClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Only admins can submit corrections
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', auth.user.id)
    .maybeSingle();
  const role = profile?.role || 'practice';

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can submit corrections' }, { status: 403 });
  }

  // Use service-role client for writes so RLS does not block the updates.
  // Auth + admin check above already gate access.
  const admin = createServiceClient();

  const body = await request.json().catch(() => ({}));
  const { stimulus_html, stem_html, options, flag_broken } = body || {};

  // Get the current version
  const { data: version, error: verErr } = await admin
    .from('question_versions')
    .select('id')
    .eq('question_id', questionId)
    .eq('is_current', true)
    .maybeSingle();

  if (verErr) return NextResponse.json({ error: verErr.message }, { status: 400 });

  // Fallback to newest version
  let versionId = version?.id;
  if (!versionId) {
    const { data: fallback } = await admin
      .from('question_versions')
      .select('id')
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    versionId = fallback?.id;
  }

  if (!versionId) {
    return NextResponse.json({ error: 'No question version found' }, { status: 404 });
  }

  // Update question_versions fields if provided
  const versionPatch = {};
  if (typeof stimulus_html === 'string') versionPatch.stimulus_html = stimulus_html;
  if (typeof stem_html === 'string') versionPatch.stem_html = stem_html;

  if (Object.keys(versionPatch).length > 0) {
    const { error } = await admin
      .from('question_versions')
      .update(versionPatch)
      .eq('id', versionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update answer options if provided (keyed by option id)
  if (options && typeof options === 'object') {
    for (const [optionId, contentHtml] of Object.entries(options)) {
      if (typeof contentHtml !== 'string') continue;
      const { error } = await admin
        .from('answer_options')
        .update({ content_html: contentHtml })
        .eq('id', optionId)
        .eq('question_version_id', versionId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  // Flag as broken via RPC (use service client to bypass RLS consistently)
  if (flag_broken !== false) {
    const { error: brokenErr } = await admin.rpc('set_question_broken', {
      question_uuid: questionId,
      broken: true,
    });
    if (brokenErr) return NextResponse.json({ error: brokenErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
