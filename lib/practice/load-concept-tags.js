// Server-side loader for the per-question concept-tags surface.
// Powers the new-tree ConceptTags island so it doesn't need to
// useEffect+fetch /api/concept-tags on mount.
//
// Returns the full concept_tags catalog plus the subset linked to
// this question, mirroring the GET /api/concept-tags route shape.
// Role flags (canTag = manager/admin write, canDelete = admin only)
// drive the inline UI without re-checking on the client.
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
  const [{ data: tags }, { data: links }] = await Promise.all([
    supabase
      .from('concept_tags')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('question_concept_tags')
      .select('tag_id')
      .eq('question_id', questionId),
  ]);

  return {
    tags: tags ?? [],
    questionTagIds: (links ?? []).map((r) => r.tag_id),
    canTag,
    canDelete,
  };
}
