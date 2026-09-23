// Server Action for tagging a question with the techniques that solve
// it (docs/foundations-and-question-patterns.md §8).
//
// The write goes through the set_question_techniques() SECURITY
// DEFINER function rather than direct question_techniques writes,
// because that table's write policies are admin-only and managers
// tag too — the function is gated on is_manager() and touches
// question_techniques and nothing else. Same rationale as
// mergeConceptTags in the admin concept-tag actions: when the
// privileged operation is narrow, give it a narrow definer function
// instead of widening a table's policy.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

export interface TechniqueTagResult {
  questionId: string;
  techniqueIds: string[];
  techniqueNames: string[];
  taggedByName: string | null;
  taggedAt: string | null;
}

interface RpcPayload {
  question_id: string;
  technique_ids: string[] | null;
  technique_names: string[] | null;
  tagged_by: string | null;
  tagged_by_name: string | null;
  tagged_at: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Replace a question's technique tags with `techniqueIds` (an empty
 * list clears them). The role check here is a fast fail with a
 * readable message; the function re-checks is_manager() itself, so a
 * caller reaching the RPC by another route is still refused at the
 * database.
 */
export async function setQuestionTechniques({
  questionId,
  techniqueIds,
}: {
  questionId: string;
  techniqueIds: readonly string[];
}): Promise<ActionResult<{ data: TechniqueTagResult }>> {
  if (!questionId || !UUID_RE.test(questionId)) return actionFail('questionId required');
  const ids = [...new Set((techniqueIds ?? []).filter((id) => UUID_RE.test(id)))];

  let ctx;
  try {
    ctx = await requireRole(['manager', 'admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data, error } = await ctx.supabase.rpc('set_question_techniques', {
    p_question_id: questionId,
    p_technique_ids: ids,
  });
  if (error) return actionFail(error.message);

  const payload = data as unknown as RpcPayload | null;
  if (!payload) return actionFail('Tagging returned no result');

  // Tag counts show on the Techniques catalog.
  revalidatePath('/admin/techniques');

  return actionOk({
    questionId: payload.question_id,
    techniqueIds: payload.technique_ids ?? [],
    techniqueNames: payload.technique_names ?? [],
    taggedByName: payload.tagged_by_name,
    taggedAt: payload.tagged_at,
  });
}
