// Bulk v2 → v1 question_id translator. Used by read paths that
// still join attempts and other tables keyed by v1 question_ids
// (assignment reports, practice-test results, session review).
//
// question_id_map carries the mapping (old_question_id ↔
// new_question_id, PK = old). Multiple v1 rows can map to the same
// v2 row (different versions of the same question). Read paths
// build the union of (v2 id, all v1 counterparts) to capture
// activity recorded against any historical version.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

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
