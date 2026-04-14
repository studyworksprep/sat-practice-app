import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// Read/view: teachers, managers, admins.
// Write (add tags): managers, admins only.
// Remove / rename / delete vocabulary: admins only.
const VIEW_ROLES = new Set(['teacher', 'manager', 'admin']);
const WRITE_ROLES = new Set(['manager', 'admin']);

async function getAuthedUser(supabase, allowedRoles) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !allowedRoles.has(profile.role)) return null;
  return { user, profile };
}

// Look up the correct option's label for a given question_id so we can reject
// attempts to tag the correct answer. Returns null if the correct answer can't
// be resolved (e.g. SPR question).
async function getCorrectOptionLabel(supabase, questionId) {
  const { data: version } = await supabase
    .from('question_versions')
    .select('id')
    .eq('question_id', questionId)
    .order('is_current', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return null;

  const { data: ca } = await supabase
    .from('correct_answers')
    .select('correct_option_id')
    .eq('question_version_id', version.id)
    .maybeSingle();
  if (!ca?.correct_option_id) return null;

  const { data: opt } = await supabase
    .from('answer_options')
    .select('label')
    .eq('id', ca.correct_option_id)
    .maybeSingle();
  return opt?.label ?? null;
}

// GET /api/answer-choice-tags?questionId=<uuid>
//   Returns tag vocabulary + all assignments for every option on the question.
// GET /api/answer-choice-tags
//   Returns tag vocabulary only (for admin management screens).
export async function GET(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase, VIEW_ROLES);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const questionId = request.nextUrl.searchParams.get('questionId');

  const { data: allTags, error: tagErr } = await supabase
    .from('answer_choice_tags')
    .select('id, name, created_at, updated_at')
    .order('name', { ascending: true });
  if (tagErr) return NextResponse.json({ error: tagErr.message }, { status: 500 });

  let assignments = [];
  if (questionId) {
    const { data: rows, error: asgErr } = await supabase
      .from('option_answer_choice_tags')
      .select('option_label, tag_id')
      .eq('question_id', questionId);
    if (asgErr) return NextResponse.json({ error: asgErr.message }, { status: 500 });
    assignments = rows || [];
  }

  return NextResponse.json({
    tags: allTags || [],
    assignments,
    is_admin: auth.profile.role === 'admin',
    can_write: WRITE_ROLES.has(auth.profile.role),
  });
}

// POST /api/answer-choice-tags  { questionId, optionLabel, tagName }
// Adds a tag to a specific wrong-answer option. Creates the tag if it
// doesn't exist. Rejects if optionLabel refers to the correct answer.
export async function POST(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase, WRITE_ROLES);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { questionId, optionLabel, tagName } = body;
  if (!questionId || !optionLabel || !tagName?.trim()) {
    return NextResponse.json(
      { error: 'questionId, optionLabel, and tagName required' },
      { status: 400 }
    );
  }

  // Guard: never allow tagging the correct answer.
  const correctLabel = await getCorrectOptionLabel(supabase, questionId);
  if (correctLabel && correctLabel === optionLabel) {
    return NextResponse.json(
      { error: 'Cannot tag the correct answer' },
      { status: 400 }
    );
  }

  const normalized = tagName.trim();

  // Find-or-create the tag (case-insensitive match on name).
  let { data: existing } = await supabase
    .from('answer_choice_tags')
    .select('id, name')
    .ilike('name', normalized)
    .maybeSingle();

  let tag = existing;
  if (!tag) {
    const { data: newTag, error: createErr } = await supabase
      .from('answer_choice_tags')
      .insert({ name: normalized, created_by: auth.user.id })
      .select('id, name')
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    tag = newTag;
  }

  const { error: linkErr } = await supabase
    .from('option_answer_choice_tags')
    .upsert(
      {
        question_id: questionId,
        option_label: optionLabel,
        tag_id: tag.id,
        created_by: auth.user.id,
      },
      { onConflict: 'question_id,option_label,tag_id', ignoreDuplicates: true }
    );

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 });

  return NextResponse.json({ tag, linked: true });
}

// DELETE /api/answer-choice-tags  { tagId, questionId?, optionLabel? }
//   With questionId+optionLabel: unlinks the tag from that specific option.
//   Without those: deletes the tag from the vocabulary entirely.
// Both paths are admin-only.
export async function DELETE(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase, WRITE_ROLES);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { tagId, questionId, optionLabel } = body;
  if (!tagId) return NextResponse.json({ error: 'tagId required' }, { status: 400 });

  if (questionId && optionLabel) {
    const { error } = await supabase
      .from('option_answer_choice_tags')
      .delete()
      .eq('question_id', questionId)
      .eq('option_label', optionLabel)
      .eq('tag_id', tagId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ removed: true });
  }

  const { error } = await supabase
    .from('answer_choice_tags')
    .delete()
    .eq('id', tagId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}

// PATCH /api/answer-choice-tags  { tagId, name }
// Rename a tag. Admin only.
export async function PATCH(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase, WRITE_ROLES);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (auth.profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { tagId, name } = body;
  if (!tagId || !name?.trim()) {
    return NextResponse.json({ error: 'tagId and name required' }, { status: 400 });
  }

  const { data: tag, error } = await supabase
    .from('answer_choice_tags')
    .update({ name: name.trim() })
    .eq('id', tagId)
    .select('id, name, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tag });
}
