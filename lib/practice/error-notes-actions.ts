// Server Actions for the student-private Error Log feature.
//
// Storage shape: one row per (user, question_v2) in
// public.question_error_notes. Owner-only RLS (see migration
// 20240101000038). The Practice runner uses these actions to
// load + save the current question's note; the Review tree's
// /review/error-log page uses the loadErrorNotes helper to
// render the full history.
//
// Legacy "Error Log" lived on question_status.notes (v1-keyed)
// — that path is left untouched so legacy users keep working
// during the rollout. A backfill script can copy notes across
// during cutover; not run from this module.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

const MAX_BODY_LEN = 10_000;

interface SavePayload {
  body: string;
}

interface NoteShape {
  body: string;
  updatedAt: string;
}

// `type` rather than `interface` so the literal satisfies the
// `Record<string, unknown>` constraint on ActionResult<T>.
type NoteResultData = { note: NoteShape | null };

/** Save (insert or update) the current user's error-log note for
 *  one question. Empty / whitespace-only body deletes the row, so
 *  the student can clear a stale note without an extra API. */
export async function saveErrorNote(
  questionId: string,
  payload: SavePayload,
): Promise<ActionResult<NoteResultData>> {
  if (!questionId) return actionFail('questionId required');

  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const trimmed = (payload?.body ?? '').trim();

  // Empty body → delete. Lets the student clear a stale note
  // without bloating the public surface area.
  if (trimmed === '') {
    const { error } = await supabase
      .from('question_error_notes')
      .delete()
      .eq('user_id', user.id)
      .eq('question_id', questionId);
    if (error) return actionFail(`Could not clear note: ${error.message}`);
    return { ok: true, note: null };
  }

  if (trimmed.length > MAX_BODY_LEN) {
    return actionFail(`Note is too long (max ${MAX_BODY_LEN} characters)`);
  }

  const { data, error } = await supabase
    .from('question_error_notes')
    .upsert(
      { user_id: user.id, question_id: questionId, body: trimmed },
      { onConflict: 'user_id,question_id' },
    )
    .select('body, updated_at')
    .maybeSingle();

  if (error) return actionFail(`Could not save note: ${error.message}`);
  return {
    ok: true,
    note: data
      ? { body: data.body as string, updatedAt: data.updated_at as string }
      : null,
  };
}

/** Read the current user's error-log note for one question.
 *  Returns null when the student hasn't written one yet. */
export async function getErrorNote(
  questionId: string,
): Promise<ActionResult<NoteResultData>> {
  if (!questionId) return actionFail('questionId required');

  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const { data, error } = await supabase
    .from('question_error_notes')
    .select('body, updated_at')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle();

  if (error) return actionFail(`Could not load note: ${error.message}`);
  return {
    ok: true,
    note: data
      ? { body: data.body as string, updatedAt: data.updated_at as string }
      : null,
  };
}
