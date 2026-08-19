// Server Action for the per-question "Stats" modal.
//
// Fetched lazily — only when a manager/admin opens the modal on the
// question review page — so the page itself never pays for it. One
// RPC call: public.get_question_stats(question_id) (SECURITY DEFINER,
// staff-gated in SQL; aggregates only). We call it through the
// caller's own RLS-scoped client, so auth.uid() inside the function is
// the viewer and the `roster` cut is computed for them specifically.
//
// Role gate: QUESTION_STATS_ROLES (manager + admin today). The DB
// function admits any staff role, so widening to teachers is a change
// to that one array — no migration.

'use server';

import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';
import {
  QUESTION_STATS_ROLES,
  parseQuestionStats,
  type QuestionStats,
} from './question-stats';

export async function loadQuestionStatsAction(
  { questionId }: { questionId: string },
): Promise<ActionResult<{ data: QuestionStats }>> {
  if (!questionId || typeof questionId !== 'string') {
    return actionFail('questionId required');
  }

  let supabase;
  let profile;
  try {
    ({ supabase, profile } = await requireRole(QUESTION_STATS_ROLES));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const { data, error } = await supabase.rpc('get_question_stats', {
    p_question_id: questionId,
  });
  if (error) {
    return actionFail(`Could not load question stats: ${error.message}`);
  }

  const stats = parseQuestionStats(data);
  if (!stats) return actionFail('Question not found');

  // Admins see every student, so the roster cut is a duplicate of
  // `all` — drop it rather than render two identical columns.
  if (profile.role === 'admin') stats.roster = null;

  return actionOk(stats);
}
