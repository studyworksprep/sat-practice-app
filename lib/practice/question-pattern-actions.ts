// Server Action for classifying a question against the pattern
// catalog (docs/foundations-and-question-patterns.md §3.4 step 2).
//
// The write goes through the set_question_pattern() SECURITY DEFINER
// function rather than a direct questions_v2 update, because
// questions_v2 UPDATE is admin-only and should stay that way — a
// policy wide enough for tutors to classify would also let them edit
// stem_html and publication state. The function writes pattern_id plus
// its attribution columns and nothing else.
//
// Same rationale as mergeConceptTags in the admin concept-tag actions:
// when the privileged operation is narrow, give it a narrow definer
// function instead of widening the table's policy.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

export interface PatternTagResult {
  questionId: string;
  patternId: string | null;
  patternName: string | null;
  taggedByName: string | null;
  taggedAt: string | null;
}

interface RpcPayload {
  question_id: string;
  pattern_id: string | null;
  pattern_name: string | null;
  tagged_by: string | null;
  tagged_by_name: string | null;
  tagged_at: string | null;
}

/**
 * Set or clear a question's pattern. Pass patternId: null to clear.
 *
 * The role check here is a fast fail with a readable message; the
 * function re-checks is_manager() itself, so a caller reaching the RPC
 * by another route is still refused at the database.
 */
export async function setQuestionPattern({
  questionId,
  patternId,
}: {
  questionId: string;
  patternId: string | null;
}): Promise<ActionResult<{ data: PatternTagResult }>> {
  if (!questionId) return actionFail('questionId required');

  let ctx;
  try {
    ctx = await requireRole(['manager', 'admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data, error } = await ctx.supabase.rpc('set_question_pattern', {
    p_question_id: questionId,
    // The generated Args type narrows uuid parameters to `string`, but
    // the function accepts null to clear a tag — a valid argument the
    // generator has no way to express.
    p_pattern_id: patternId as string,
  });

  if (error) {
    // The function raises readable messages ("Pattern X belongs to
    // INI/INF, but this question is CAS/TSP"), so surface them rather
    // than a generic failure — the mismatch case is the one a tutor
    // most needs explained.
    return actionFail(error.message);
  }

  const payload = data as unknown as RpcPayload | null;
  if (!payload) return actionFail('Tagging returned no result');

  // Pattern names show on the admin catalog's usage counts and the
  // question browser's pattern filter.
  revalidatePath('/admin/content/patterns');

  return actionOk({
    questionId: payload.question_id,
    patternId: payload.pattern_id,
    patternName: payload.pattern_name,
    taggedByName: payload.tagged_by_name,
    taggedAt: payload.tagged_at,
  });
}
