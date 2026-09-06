// Race-safe creation of a practice-test item attempt.
//
// Three writers can be the first to touch a (module attempt, item)
// pair: the answer save (recordItemAnswer), the mark-for-review
// toggle (toggleMarkForReview) and the time-ping beacon
// (app/api/practice-test/time-ping). Each one used to do the same
// three unguarded steps — look for the link row, insert an
// `attempts` row, insert the link row — and when two of them landed
// in the same instant (a beacon firing as the student answered;
// measured gaps of 0–0.7 s in production) both inserted an
// `attempts` row, the second link insert hit the table's unique
// (module_attempt, item) constraint, and its `attempts` row was left
// behind with no link: 185 orphan twins between May and August 2026,
// each inflating the question's attempt count and sometimes standing
// in as the student's "first attempt".
//
// This helper keeps the same two writes but makes the link insert
// ON CONFLICT DO NOTHING (PostgREST `resolution=ignore-duplicates`).
// The winner gets its row back; the loser gets nothing back, deletes
// the `attempts` row it just created, and returns the winner's ids so
// the caller can apply its write to that row instead. The FK on
// `attempt_id` forces the attempts insert to come first, which is
// why the loser has something to clean up.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/types/database';

type AttemptInsert = Database['public']['Tables']['attempts']['Insert'];

/** Column list of the unique constraint on practice_test_item_attempts_v2. */
export const ITEM_ATTEMPT_CONFLICT_TARGET =
  'practice_test_module_attempt_id,practice_test_module_item_id';

export interface ClaimItemAttemptInput {
  moduleAttemptId: string;
  moduleItemId: string;
  /** The `attempts` row to create if this call wins the claim. */
  attempt: AttemptInsert;
  /** Initial flag on the link row when this call creates it. */
  markedForReview?: boolean;
}

export interface ClaimedItemAttempt {
  ok: true;
  /** true: this call created both rows. false: a concurrent writer
   *  got there first; the ids below are that writer's rows and this
   *  call's `attempts` row has been discarded. */
  created: boolean;
  itemAttemptId: string;
  attemptId: string;
  markedForReview: boolean;
}

export type ClaimItemAttemptResult =
  | ClaimedItemAttempt
  | { ok: false; error: string };

export async function claimItemAttempt(
  supabase: TypedSupabaseClient,
  input: ClaimItemAttemptInput,
): Promise<ClaimItemAttemptResult> {
  const { data: attemptRow, error: attemptErr } = await supabase
    .from('attempts')
    .insert(input.attempt)
    .select('id')
    .single();
  if (attemptErr || !attemptRow) {
    return { ok: false, error: attemptErr?.message ?? 'attempt insert failed' };
  }

  // Best-effort: the row is ours (RLS: user_id = auth.uid()) and
  // nothing references it yet. If the delete itself fails we still
  // report the outcome of the claim; the row is at worst the same
  // orphan this helper exists to prevent, never a wrong answer.
  const discardOwnAttempt = async () => {
    await supabase.from('attempts').delete().eq('id', attemptRow.id);
  };

  const { data: linkRow, error: linkErr } = await supabase
    .from('practice_test_item_attempts_v2')
    .upsert(
      {
        practice_test_module_attempt_id: input.moduleAttemptId,
        practice_test_module_item_id: input.moduleItemId,
        attempt_id: attemptRow.id,
        marked_for_review: input.markedForReview ?? false,
      },
      { onConflict: ITEM_ATTEMPT_CONFLICT_TARGET, ignoreDuplicates: true },
    )
    .select('id, attempt_id, marked_for_review')
    .maybeSingle();

  if (linkErr) {
    await discardOwnAttempt();
    return { ok: false, error: linkErr.message };
  }
  if (linkRow) {
    return {
      ok: true,
      created: true,
      itemAttemptId: linkRow.id,
      attemptId: linkRow.attempt_id,
      markedForReview: linkRow.marked_for_review === true,
    };
  }

  // Conflict: someone else linked this item between our lookup and
  // our insert. Drop our attempts row and hand back theirs.
  await discardOwnAttempt();
  const { data: existing, error: existingErr } = await supabase
    .from('practice_test_item_attempts_v2')
    .select('id, attempt_id, marked_for_review')
    .eq('practice_test_module_attempt_id', input.moduleAttemptId)
    .eq('practice_test_module_item_id', input.moduleItemId)
    .maybeSingle();
  if (existingErr || !existing) {
    return {
      ok: false,
      error: existingErr?.message ?? 'item attempt vanished after conflict',
    };
  }
  return {
    ok: true,
    created: false,
    itemAttemptId: existing.id,
    attemptId: existing.attempt_id,
    markedForReview: existing.marked_for_review === true,
  };
}
