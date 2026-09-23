// Server Action behind the technique tagging screen: loads the next
// question's view-model as the editor moves through a unit
// (docs/foundations-and-question-patterns.md §8.5 step B).
//
// The screen renders one question at a time and a unit holds ~100 of
// them with rendered HTML each, so the page server-renders only the
// first and fetches the rest on demand, one per step, prefetching the
// one after. Saving goes through setQuestionTechniques()
// (lib/practice/question-technique-actions) — the same manager-gated
// RPC path every review surface uses.

'use server';

import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { loadTaggingQuestionVM, type TaggingQuestionVM } from '@/lib/practice/tagging-question';
import type { ActionResult } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A 'use server' module may export async functions only, so the role
// list stays inline: manager + admin, matching is_manager() in the RPC.

export async function loadTaggingQuestion({
  questionId,
}: {
  questionId: string;
}): Promise<ActionResult<{ data: TaggingQuestionVM }>> {
  if (!UUID_RE.test(questionId ?? '')) return actionFail('questionId required');
  let ctx;
  try {
    ctx = await requireRole(['manager', 'admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  const vm = await loadTaggingQuestionVM(ctx.supabase, questionId);
  if (!vm) return actionFail('Question not found.');
  return actionOk(vm);
}
