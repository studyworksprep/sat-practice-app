import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/concept-tags?questionId=<uuid>  — returns all tags + which are on this question
// GET /api/concept-tags                    — returns all tags (for admin management)
export const GET = legacyApiRoute(async (request) => {
  const { supabase, profile } = await requireRole(['manager', 'admin']);

  const questionId = request.nextUrl.searchParams.get('questionId');

  const { data: allTags, error: tagErr } = await supabase
    .from('concept_tags')
    .select('id, name, created_at, updated_at')
    .order('name', { ascending: true });

  if (tagErr) return NextResponse.json({ error: tagErr.message }, { status: 500 });

  let questionTagIds = [];
  if (questionId) {
    const { data: qTags, error: qtErr } = await supabase
      .from('question_concept_tags')
      .select('tag_id')
      .eq('question_id', questionId);
    if (qtErr) return NextResponse.json({ error: qtErr.message }, { status: 500 });
    questionTagIds = (qTags || []).map(qt => qt.tag_id);
  }

  return NextResponse.json({
    tags: allTags || [],
    questionTagIds,
    is_admin: profile.role === 'admin',
  });
});

// POST /api/concept-tags  { questionId, tagName }
// Adds a tag to a question. Creates the tag if it doesn't exist.
export const POST = legacyApiRoute(async (request) => {
  const { supabase, user } = await requireRole(['manager', 'admin']);

  const body = await request.json();
  const { questionId, tagName } = body;
  if (!questionId || !tagName?.trim()) {
    return NextResponse.json({ error: 'questionId and tagName required' }, { status: 400 });
  }

  const normalized = tagName.trim();

  let { data: existing } = await supabase
    .from('concept_tags')
    .select('id, name')
    .ilike('name', normalized)
    .maybeSingle();

  let tag = existing;
  if (!tag) {
    const { data: newTag, error: createErr } = await supabase
      .from('concept_tags')
      .insert({ name: normalized, created_by: user.id })
      .select('id, name')
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    tag = newTag;
  }

  const { error: linkErr } = await supabase
    .from('question_concept_tags')
    .upsert(
      { question_id: questionId, tag_id: tag.id, created_by: user.id },
      { onConflict: 'question_id,tag_id', ignoreDuplicates: true }
    );

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({ tag, linked: true });
});

// DELETE /api/concept-tags  { tagId, questionId? }
// Both branches (unlink-from-question and delete-tag) require admin.
// Manager role can read+create+link tags but not delete them.
export const DELETE = legacyApiRoute(async (request) => {
  const { supabase, profile } = await requireRole(['manager', 'admin']);

  const body = await request.json();
  const { tagId, questionId } = body;
  if (!tagId) return NextResponse.json({ error: 'tagId required' }, { status: 400 });

  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (questionId) {
    const { error } = await supabase
      .from('question_concept_tags')
      .delete()
      .eq('question_id', questionId)
      .eq('tag_id', tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ removed: true });
  }

  const { error } = await supabase
    .from('concept_tags')
    .delete()
    .eq('id', tagId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
});

// PATCH /api/concept-tags  { tagId, name }
// Rename a tag — admin only
export const PATCH = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['admin']);

  const body = await request.json();
  const { tagId, name } = body;
  if (!tagId || !name?.trim()) {
    return NextResponse.json({ error: 'tagId and name required' }, { status: 400 });
  }

  const { data: tag, error } = await supabase
    .from('concept_tags')
    .update({ name: name.trim() })
    .eq('id', tagId)
    .select('id, name, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tag });
});
