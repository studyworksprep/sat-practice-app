import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';

// POST /api/questions/:questionId/correct
// Admin/Manager: update question content & taxonomy fields, flag as broken.
export async function POST(request, { params }) {
  const questionId = params.questionId;

  // Prefer middleware-provided user ID (avoids stale-cookie auth issues)
  const userId = request.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = createServiceClient();

  // Only admins and managers can submit corrections
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  const role = profile?.role || 'practice';

  if (role !== 'admin' && role !== 'manager') {
    return NextResponse.json({ error: 'Only admins and managers can submit corrections' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { stimulus_html, stem_html, options, flag_broken, taxonomy } = body || {};

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

  // Update taxonomy fields if provided
  if (taxonomy && typeof taxonomy === 'object') {
    const taxPatch = {};
    if (taxonomy.difficulty !== undefined) taxPatch.difficulty = Number(taxonomy.difficulty) || null;
    if (taxonomy.score_band !== undefined) taxPatch.score_band = Number(taxonomy.score_band) || null;
    if (typeof taxonomy.domain_code === 'string') {
      taxPatch.domain_code = taxonomy.domain_code;
      taxPatch.domain_name = taxonomy.domain_name || null;
    }
    if (typeof taxonomy.skill_code === 'string') {
      taxPatch.skill_code = taxonomy.skill_code;
      taxPatch.skill_name = taxonomy.skill_name || null;
    }
    if (Object.keys(taxPatch).length > 0) {
      const { error: taxErr } = await admin
        .from('question_taxonomy')
        .update(taxPatch)
        .eq('question_id', questionId);
      if (taxErr) return NextResponse.json({ error: taxErr.message }, { status: 400 });
    }
  }

  // Flag/unflag broken via RPC (use service client to bypass RLS consistently)
  if (flag_broken !== undefined) {
    const { error: brokenErr } = await admin.rpc('set_question_broken', {
      question_uuid: questionId,
      broken: Boolean(flag_broken),
    });
    if (brokenErr) return NextResponse.json({ error: brokenErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
