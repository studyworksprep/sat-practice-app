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
import type { ActionResult, Json, TestType } from '@/lib/types';

// desmos_saved_states holds SAT (questions_v2) and ACT (act_questions)
// rows side by side, told apart by test_type. Resolve which table
// the id lives in so the stamp matches what the loaders filter on,
// and reject ids that exist in neither (a stale id would otherwise
// surface as a generic 500).
async function resolveQuestion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  qid: string,
): Promise<{ id: string; testType: TestType } | null> {
  if (!qid) return null;
  const [{ data: v2 }, { data: act }] = await Promise.all([
    supabase.from('questions_v2').select('id').eq('id', qid).maybeSingle(),
    supabase.from('act_questions').select('id').eq('id', qid).maybeSingle(),
  ]);
  if (v2?.id) return { id: v2.id as string, testType: 'sat' };
  if (act?.id) return { id: act.id as string, testType: 'act' };
  return null;
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

  const resolved = await resolveQuestion(supabase, questionId);
  if (!resolved) return actionFail('question not found');

  const { error } = await supabase
    .from('desmos_saved_states')
    .upsert(
      {
        question_id: resolved.id,
        // Desmos getState() output is plain JSON-serializable data;
        // the cast narrows Record<string, unknown> to the column type.
        state_json: stateJson as Json,
        saved_by: profile.id,
        updated_at: new Date().toISOString(),
        test_type: resolved.testType,
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

  const resolved = await resolveQuestion(supabase, questionId);
  if (!resolved) return actionFail('question not found');

  // question_id is unique on this table, so no test_type filter is
  // needed to find the row.
  const { error } = await supabase
    .from('desmos_saved_states')
    .delete()
    .eq('question_id', resolved.id);

  if (error) return actionFail(error.message);
  revalidatePath('/practice', 'layout');
  return actionOk();
}
