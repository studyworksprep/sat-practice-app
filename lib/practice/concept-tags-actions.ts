// Server Actions for the per-question concept-tags surface.
// Replace the legacy fetch('/api/concept-tags', { method: 'POST' |
// 'DELETE' }) calls inside components/ConceptTags.js so the new-
// tree island uses React 19's action machinery.
//
// Same role gating as the API route:
//   - Add (POST): manager / admin
//   - Remove from question (DELETE with questionId): admin only
//
// Tag rename and tag-wide deletion (PATCH and DELETE without
// questionId on the API route) aren't surfaced through the
// per-question component in any tree — admin tag management lives
// in the legacy admin dashboard. They stay on the API route.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

interface ConceptTagSummary {
  id: string;
  name: string;
}

/** Add a concept tag to a question. Creates the tag if it doesn't
 *  already exist (case-insensitive name match). Returns the tag
 *  (existing or newly created) so the client can drop it into its
 *  list without a refetch. */
export async function addConceptTag({
  questionId,
  tagName,
}: {
  questionId: string;
  tagName: string;
}): Promise<ActionResult<{ data: { tag: ConceptTagSummary } }>> {
  if (!questionId) return actionFail('questionId required');
  const trimmed = (tagName ?? '').trim();
  if (!trimmed) return actionFail('tagName required');

  let supabase;
  let user;
  try {
    ({ supabase, user } = await requireRole(['manager', 'admin']));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  // Case-insensitive existing-tag lookup. ilike with no wildcard
  // matches the literal name regardless of casing.
  const { data: existing } = await supabase
    .from('concept_tags')
    .select('id, name')
    .ilike('name', trimmed)
    .maybeSingle();

  let tag: ConceptTagSummary | null = existing;
  if (!tag) {
    const { data: newTag, error: createErr } = await supabase
      .from('concept_tags')
      .insert({ name: trimmed, created_by: user.id })
      .select('id, name')
      .single();
    if (createErr) return actionFail(createErr.message);
    tag = newTag;
  }

  // Link tag → question. Idempotent via upsert on the composite
  // unique key, so re-adding a tag the question already has is a
  // no-op rather than an error.
  const { error: linkErr } = await supabase
    .from('question_concept_tags')
    .upsert(
      { question_id: questionId, tag_id: tag!.id, created_by: user.id },
      { onConflict: 'question_id,tag_id', ignoreDuplicates: true },
    );
  if (linkErr) return actionFail(linkErr.message);

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk({ tag: tag! });
}

/** Remove a concept tag from a question. Doesn't delete the tag
 *  itself — that's a separate admin-management action on the API
 *  route. */
export async function removeConceptTagFromQuestion({
  tagId,
  questionId,
}: {
  tagId: string;
  questionId: string;
}): Promise<ActionResult> {
  if (!tagId) return actionFail('tagId required');
  if (!questionId) return actionFail('questionId required');

  let supabase;
  try {
    ({ supabase } = await requireRole(['admin']));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const { error } = await supabase
    .from('question_concept_tags')
    .delete()
    .eq('question_id', questionId)
    .eq('tag_id', tagId);
  if (error) return actionFail(error.message);

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk();
}
