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
import { resolveLegacyQuestionId } from './legacy-id-map';
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

  // question_concept_tags.question_id FKs to the v1 questions
  // table. The new-tree report passes v2 ids; translate now
  // before any write so the FK insert succeeds. Fail cleanly
  // when no v1 counterpart exists (post-cutover questions with
  // no v1 row) instead of letting the raw FK error reach the
  // user.
  const legacyQuestionId = await resolveLegacyQuestionId(supabase, questionId);
  if (legacyQuestionId === questionId) {
    // No mapping found — verify the id actually exists in v1
    // before attempting the insert. This produces a friendlier
    // error than the raw FK violation.
    const { data: legacyRow } = await supabase
      .from('questions')
      .select('id')
      .eq('id', questionId)
      .maybeSingle();
    if (!legacyRow) {
      return actionFail(
        'Concept tags are pinned to the legacy questions table; this question has no v1 counterpart yet.',
      );
    }
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
      { question_id: legacyQuestionId, tag_id: tag!.id, created_by: user.id },
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

  // Same v1 translation as the add path — the row was stored
  // against the legacy id, so the delete must match on that.
  const legacyQuestionId = await resolveLegacyQuestionId(supabase, questionId);

  const { error } = await supabase
    .from('question_concept_tags')
    .delete()
    .eq('question_id', legacyQuestionId)
    .eq('tag_id', tagId);
  if (error) return actionFail(error.message);

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk();
}
