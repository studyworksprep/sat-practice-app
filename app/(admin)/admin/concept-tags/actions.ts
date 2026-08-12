// Admin Server Actions for the concept-tag catalog.
//
// The per-question tagging surface (lib/practice/concept-tags-actions)
// covers add/remove on a single question. This module is the catalog-
// management side that used to live in the legacy admin dashboard:
// rename a tag everywhere, delete a tag outright, and merge two tags
// that were accidentally created for the same concept.
//
// Admin-only via requireRole(['admin']). RLS already grants admins
// UPDATE/DELETE on concept_tags, so rename and delete use the normal
// RLS-scoped client. Merge goes through the merge_concept_tags()
// SECURITY DEFINER function (migration 20260812140831) because
// question_concept_tags has no UPDATE policy and the repoint-dedupe-
// delete sequence must be atomic.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult, AuthContext } from '@/lib/types';

const NAME_MAX = 120;

export interface MergeSummary {
  moved: number;
  skipped_duplicates: number;
  source_name: string;
  target_name: string;
}

async function adminCtx(): Promise<AuthContext> {
  return requireRole(['admin']);
}

// Tag chips render inside practice review, tutor reports, and student
// test results — the same layouts the per-question actions revalidate.
function revalidateTagSurfaces() {
  revalidatePath('/admin/concept-tags');
  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
}

// ilike treats % and _ as wildcards; tag names like "Percent %" must
// match literally when we probe for case-insensitive duplicates.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Rename a tag everywhere it appears. */
export async function renameConceptTag({
  tagId,
  name,
}: {
  tagId: string;
  name: string;
}): Promise<ActionResult<{ data: { tag: { id: string; name: string } } }>> {
  if (!tagId) return actionFail('tagId required');
  const trimmed = (name ?? '').trim();
  if (!trimmed) return actionFail('Tag name cannot be empty');
  if (trimmed.length > NAME_MAX) {
    return actionFail(`Tag name too long (max ${NAME_MAX} characters)`);
  }

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  // The unique constraint on name is case-sensitive, but the add flow
  // matches case-insensitively — a rename differing only in case from
  // ANOTHER tag would create a pair the add flow can't tell apart.
  // Catch it here and point the admin at merge instead.
  const { data: clash } = await supabase
    .from('concept_tags')
    .select('id, name')
    .ilike('name', escapeLikePattern(trimmed))
    .neq('id', tagId)
    .maybeSingle();
  if (clash) {
    return actionFail(
      `A tag named “${clash.name}” already exists — merge into it instead.`,
    );
  }

  const { data: tag, error } = await supabase
    .from('concept_tags')
    .update({ name: trimmed })
    .eq('id', tagId)
    .select('id, name')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') {
      return actionFail('A tag with this name already exists — merge instead.');
    }
    return actionFail(error.message);
  }
  if (!tag) return actionFail('Tag not found');

  revalidateTagSurfaces();
  return actionOk({ tag });
}

/** Delete a tag outright. Its question links go with it (FK cascade). */
export async function deleteConceptTag({
  tagId,
}: {
  tagId: string;
}): Promise<ActionResult<{ data: { name: string; removedLinks: number } }>> {
  if (!tagId) return actionFail('tagId required');

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  // Counted before the delete so the success notice can say how many
  // questions the tag came off of.
  const { count } = await supabase
    .from('question_concept_tags')
    .select('id', { count: 'exact', head: true })
    .eq('tag_id', tagId);

  const { data: deleted, error } = await supabase
    .from('concept_tags')
    .delete()
    .eq('id', tagId)
    .select('name')
    .maybeSingle();
  if (error) return actionFail(error.message);
  if (!deleted) return actionFail('Tag not found');

  revalidateTagSurfaces();
  return actionOk({ name: deleted.name, removedLinks: count ?? 0 });
}

/** Merge the source tag into the target tag: every question tagged
 *  with the source ends up tagged with the target (questions already
 *  carrying both are deduplicated), and the source tag is deleted. */
export async function mergeConceptTags({
  sourceTagId,
  targetTagId,
}: {
  sourceTagId: string;
  targetTagId: string;
}): Promise<ActionResult<{ data: { merge: MergeSummary } }>> {
  if (!sourceTagId || !targetTagId) return actionFail('Both tags are required');
  if (sourceTagId === targetTagId) return actionFail('Pick two different tags');

  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc('merge_concept_tags', {
    p_source_tag_id: sourceTagId,
    p_target_tag_id: targetTagId,
  });
  if (error) return actionFail(error.message);

  revalidateTagSurfaces();
  return actionOk({ merge: data as unknown as MergeSummary });
}
