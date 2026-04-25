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
  const { data } = await supabase
    .from('desmos_saved_states')
    .select('state_json')
    .eq('question_id', questionId)
    .maybeSingle();

  return {
    savedState: data?.state_json ?? null,
    canSave: CAN_SAVE_ROLES.has(role),
  };
}
