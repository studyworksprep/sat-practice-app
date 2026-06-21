// Server Actions for the per-question Desmos saved state. Replaces
// the legacy fetch('/api/desmos-states', { method: 'POST' | 'DELETE' })
// calls inside DesmosStateButton.js so the new-tree island uses the
// React-19 action machinery instead of useEffect + fetch.
//
// Both actions enforce the same role gate as the API route they
// supersede (manager / admin only — teachers can read but not
// write). Auth comes from requireRole; mutations return ActionResult
// (Ok|Fail) per docs/architecture-plan.md §3.3 Server Action shape.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

// desmos_saved_states.question_id is FK'd to questions_v2 (see
// migration 20260505000001). Verify the v2 row exists so a stale id
// doesn't trip the FK and surface as a generic 500.
async function resolveQuestionV2Id(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  qid: string,
): Promise<string | null> {
  if (!qid) return null;
  const { data: v2 } = await supabase
    .from('questions_v2')
    .select('id')
    .eq('id', qid)
    .maybeSingle();
  return v2?.id ? (v2.id as string) : null;
}

/** Save (upsert) a Desmos calculator state for a question.
 *  stateJson is whatever GraphingCalculator.getState() returned —
 *  an opaque blob to us, validated only as "is an object". */
export async function saveDesmosState({
  questionId,
  stateJson,
}: {
  questionId: string;
  stateJson: Record<string, unknown>;
}): Promise<ActionResult> {
  if (!questionId) return actionFail('questionId required');
  if (!stateJson || typeof stateJson !== 'object') {
    return actionFail('stateJson required');
  }

  let supabase;
  let profile;
  try {
    ({ supabase, profile } = await requireRole(['manager', 'admin']));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const v2Id = await resolveQuestionV2Id(supabase, questionId);
  if (!v2Id) return actionFail('question not found');

  const { error } = await supabase
    .from('desmos_saved_states')
    .upsert(
      {
        question_id: v2Id,
        state_json: stateJson,
        saved_by: profile.id,
        updated_at: new Date().toISOString(),
        test_type: 'sat',
      },
      { onConflict: 'question_id' },
    );

  if (error) return actionFail(error.message);

  // Revalidate any cached server renders of the question — the saved
  // state loader runs on the question-detail Server Components.
  revalidatePath('/practice', 'layout');
  return actionOk();
}

/** Delete the saved Desmos state for a question. */
export async function deleteDesmosState({
  questionId,
}: {
  questionId: string;
}): Promise<ActionResult> {
  if (!questionId) return actionFail('questionId required');

  let supabase;
  try {
    ({ supabase } = await requireRole(['manager', 'admin']));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const v2Id = await resolveQuestionV2Id(supabase, questionId);
  if (!v2Id) return actionFail('question not found');

  const { error } = await supabase
    .from('desmos_saved_states')
    .delete()
    .eq('question_id', v2Id)
    .eq('test_type', 'sat');

  if (error) return actionFail(error.message);
  revalidatePath('/practice', 'layout');
  return actionOk();
}
