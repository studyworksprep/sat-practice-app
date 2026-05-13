// Server-side loader for the per-question Desmos saved state. Called
// from the question-detail Server Components (practice runner,
// practice-test runner, session review, test results) so the
// DesmosSavedStateButton client island doesn't need a useEffect+
// fetch on the new tree.
//
// Returns:
//   - savedState: the JSON Desmos state blob (`state_json` column)
//     or null if none exists for this question.
//   - canSave: whether the caller's role can write — managers and
//     admins per the /api/desmos-states POST gate. Teachers can
//     load existing states but not save new ones.
//
// RLS: the desmos_saved_states table is readable by any authenticated
// user (writes are gated by the role check); the read here uses
// the standard rls-scoped client and returns `null` for unmatched
// rows.

import { createClient } from '@/lib/supabase/server';

const CAN_SAVE_ROLES = new Set(['manager', 'admin']);

/**
 * @param {object} args
 * @param {string} args.questionId
 * @param {string} args.role - the caller's profile.role
 * @returns {Promise<{ savedState: object|null, canSave: boolean }>}
 */
export async function loadDesmosSavedState({ questionId, role }) {
  if (!questionId) return { savedState: null, canSave: false };

  const supabase = await createClient();

  // Saved states are now stored against questions_v2 ids (migration
  // 20260505000001). The new tree passes v2 ids directly; legacy
  // callers may still pass a v1 id, so fall back to the v1→v2 map
  // before giving up. SAT-only filter — PR 4 will plumb test_type
  // from the calling session for ACT math questions.
  let { data } = await supabase
    .from('desmos_saved_states')
    .select('state_json')
    .eq('question_id', questionId)
    .eq('test_type', 'sat')
    .maybeSingle();

  if (!data) {
    const { data: mapped } = await supabase
      .from('question_id_map')
      .select('new_question_id')
      .eq('old_question_id', questionId)
      .maybeSingle();
    if (mapped?.new_question_id) {
      ({ data } = await supabase
        .from('desmos_saved_states')
        .select('state_json')
        .eq('question_id', mapped.new_question_id)
        .eq('test_type', 'sat')
        .maybeSingle());
    }
  }

  return {
    savedState: data?.state_json ?? null,
    canSave: CAN_SAVE_ROLES.has(role),
  };
}
