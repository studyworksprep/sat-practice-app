import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// POST /api/questions/:questionId/correct
// Admin/Manager: update question content & taxonomy fields, flag as broken.
export const POST = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const questionId = params.questionId;

  const { user, service: admin } = await requireServiceRole(
    'manager/admin question correction',
    { allowedRoles: ['admin', 'manager'] },
  );
  const userId = user.id;

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

  // Flag/unflag broken — update directly via service client (the RPC relies on
  // auth.uid() which is null for service clients, so we write the row ourselves).
  if (flag_broken !== undefined) {
    const isBroken = Boolean(flag_broken);
    const brokenPatch = {
      is_broken: isBroken,
      broken_by: isBroken ? userId : null,
      broken_at: isBroken ? new Date().toISOString() : null,
    };
    const { error: brokenErr } = await admin
      .from('questions')
      .update(brokenPatch)
      .eq('id', questionId);
    if (brokenErr) {
      // Fallback: if broken_by/broken_at columns don't exist yet, try updating just is_broken
      const { error: fallbackErr } = await admin
        .from('questions')
        .update({ is_broken: isBroken })
        .eq('id', questionId);
      if (fallbackErr) return NextResponse.json({ error: fallbackErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
});
