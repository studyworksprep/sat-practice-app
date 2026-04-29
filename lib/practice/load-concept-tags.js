// Server-side loader for the per-question concept-tags surface.
// Powers the new-tree ConceptTags island so it doesn't need to
// useEffect+fetch /api/concept-tags on mount.
//
// Returns the full concept_tags catalog plus the subset linked to
// this question, mirroring the GET /api/concept-tags route shape.
// Role flags (canTag = manager/admin write, canDelete = admin only)
// drive the inline UI without re-checking on the client.
//
// v1/v2 id translation. question_concept_tags FKs the legacy
// questions table — its question_id column carries v1 ids. The
// new tree passes v2 ids around, so the loader resolves every v1
// counterpart of this v2 id (multiple v1 rows can map to the same
// v2 row, one per migrated version) and queries the union. This
// matches what the write-side actions do via resolveLegacyQuestionId,
// but read-broad: a legacy tag stored on any historical v1 version
// of the question still surfaces here. Also includes the input id
// itself in the union, so a caller that happens to pass a v1 id
// (e.g., a leftover legacy code path) still works.
//
// RLS: concept_tags is readable to manager+admin (per its create
// migration). Students should never call this loader.

import { createClient } from '@/lib/supabase/server';

const CAN_TAG_ROLES = new Set(['manager', 'admin']);

/**
 * @param {object} args
 * @param {string} args.questionId
 * @param {string} args.role - the caller's profile.role
 * @returns {Promise<{
 *   tags: Array<{ id: string, name: string }>,
 *   questionTagIds: string[],
 *   canTag: boolean,
 *   canDelete: boolean,
 * }>}
 */
export async function loadConceptTags({ questionId, role }) {
  const canTag = CAN_TAG_ROLES.has(role);
  const canDelete = role === 'admin';

  // Skip the queries if the caller has no role for this surface.
  // Teachers can see tags on questions through the legacy teacher
  // review flow, but we treat them as read-only there too — for
  // the new tree's first port we surface the inline editor only
  // to manager+admin. Teacher-visible read-only is a Phase 6
  // follow-up if it turns out to matter.
  if (!canTag) {
    return { tags: [], questionTagIds: [], canTag: false, canDelete: false };
  }
  if (!questionId) {
    return { tags: [], questionTagIds: [], canTag, canDelete };
  }

  const supabase = await createClient();

  const { data: idMapRows } = await supabase
    .from('question_id_map')
    .select('old_question_id')
    .eq('new_question_id', questionId);
  const linkIds = new Set([questionId]);
  for (const row of idMapRows ?? []) {
    if (row?.old_question_id) linkIds.add(row.old_question_id);
  }

  const [{ data: tags }, { data: links }] = await Promise.all([
    supabase
      .from('concept_tags')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('question_concept_tags')
      .select('tag_id')
      .in('question_id', Array.from(linkIds)),
  ]);

  // Dedupe — the same tag can be linked across multiple v1
  // versions of the same question, which would otherwise show up
  // as duplicate chips.
  const seenTagIds = new Set();
  const questionTagIds = [];
  for (const link of links ?? []) {
    if (link?.tag_id && !seenTagIds.has(link.tag_id)) {
      seenTagIds.add(link.tag_id);
      questionTagIds.push(link.tag_id);
    }
  }

  return {
    tags: tags ?? [],
    questionTagIds,
    canTag,
    canDelete,
  };
}
