// Tiny helper for surfaces that still write into v1-keyed tables.
// concept_tags' question link table (question_concept_tags) FKs
// to questions(id) — the legacy v1 table — so a v2 question_id
// from the new tree must be translated to its v1 counterpart
// before insert/delete. question_id_map carries the mapping
// (old_question_id ↔ new_question_id, PK = old).
//
// resolveLegacyQuestionId returns the v1 id for a given v2
// questionId. Falls back to the input if it's already a v1 id
// (caller passed straight through) or if no mapping exists
// (post-cutover question with no v1 counterpart). Callers
// should be prepared to surface a clean error when the FK
// insert still fails — unmapped post-cutover questions can't
// be tagged in the v1 schema.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export async function resolveLegacyQuestionId(
  supabase: AnySupabase,
  questionId: string,
): Promise<string> {
  if (!questionId) return questionId;

  // Cheap path — input is already a v1 id (= old_question_id).
  const { data: asLegacy } = await supabase
    .from('question_id_map')
    .select('old_question_id')
    .eq('old_question_id', questionId)
    .limit(1)
    .maybeSingle();
  if (asLegacy?.old_question_id) return asLegacy.old_question_id as string;

  // Treat as v2 and look up the earliest-migrated v1
  // counterpart. Multiple v1 rows can map to the same v2 row
  // (different versions of the same question). Earliest-by-
  // migrated_at is a stable choice.
  const { data: viaMap } = await supabase
    .from('question_id_map')
    .select('old_question_id')
    .eq('new_question_id', questionId)
    .order('migrated_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (viaMap?.old_question_id) return viaMap.old_question_id as string;

  // Pass through — caller decides what to do with an
  // unmapped id.
  return questionId;
}

/**
 * Bulk variant for read paths. Returns a Map keyed by v2
 * questionId → v1 questionId. Skips any v2 id without a v1
 * counterpart. Use the keys to build the union ID list to
 * query against; use the map to translate v1 rows back to v2
 * for joining.
 */
export async function resolveLegacyQuestionIds(
  supabase: AnySupabase,
  v2QuestionIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (v2QuestionIds.length === 0) return result;

  const { data } = await supabase
    .from('question_id_map')
    .select('old_question_id, new_question_id, migrated_at')
    .in('new_question_id', v2QuestionIds)
    .order('migrated_at', { ascending: true });

  for (const row of (data ?? []) as Array<{
    old_question_id: string;
    new_question_id: string;
  }>) {
    if (!result.has(row.new_question_id)) {
      result.set(row.new_question_id, row.old_question_id);
    }
  }
  return result;
}
