// Server Actions for the student dashboard. See docs/architecture-plan.md
// §3.3, §3.4, §3.9.
//
// Every exported function is a Server Action: it runs on the server,
// is called from the client via React's Action machinery, and can
// directly read and write Supabase with the caller's RLS context.
// There is no /api/* route backing any of this. Forms in the client
// island reference these functions by import, and React serializes
// the call across the wire automatically.
//
// Return shape is `{ ok: boolean, data | error }` via actionOk() /
// actionFail() from lib/api/response.js — consumed by useActionState
// in the client island.

'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/api/auth';
import { actionOk, actionFail, ApiError } from '@/lib/api/response';

/**
 * Update the caller's target SAT score. Called from the dashboard's
 * target-score form via useActionState.
 *
 * Signature matches the useActionState contract:
 *   (previousState, formData) -> newState
 *
 * @param {object|null} _prevState - previous Action result (unused)
 * @param {FormData} formData - must contain `target` field
 * @returns {Promise<{ok: boolean, data?: any, error?: string}>}
 */
export async function updateTargetScore(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }

  const raw = formData.get('target');
  const target = Number(raw);

  if (!Number.isFinite(target)) {
    return actionFail('Target must be a number');
  }
  if (target < 400 || target > 1600) {
    return actionFail('Target must be between 400 and 1600');
  }
  if (target % 10 !== 0) {
    return actionFail('SAT scores are in 10-point increments');
  }

  const { error } = await ctx.supabase
    .from('profiles')
    .update({ target_sat_score: target })
    .eq('id', ctx.user.id);

  if (error) {
    return actionFail(`Failed to save: ${error.message}`);
  }

  // Revalidate the dashboard path so the Server Component re-renders
  // with the new target. The client island's optimistic update covers
  // the instant-feedback case; this is the durable refresh.
  revalidatePath('/dashboard');

  return actionOk({ target });
}
