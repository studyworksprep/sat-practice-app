// Server Action that returns the per-position runner payload for a
// practice-test module. This is the typed primitive that lets
// TestRunnerInteractive navigate Next/Back *without* a route change
// (§6.3b) — see lib/practice-test/load-test-question.ts for the
// loader the action wraps, and lib/practice/load-question-action.ts
// for the practice-session twin this mirrors.
//
// Auth: requireUser() runs on every call. The loader does its own
// ownership check via `practice_test_attempts_v2.user_id = caller`.
// RLS still gates the underlying tables, so a forged
// moduleAttemptId returns not_found rather than another user's
// module.

'use server';

import { requireUser } from '@/lib/api/auth';
import { loadTestQuestion } from './load-test-question';
import type {
  LoadTestQuestionInput,
  LoadTestQuestionResult,
} from './load-test-question';
import type { ActionResult, UserRole } from '@/lib/types';

/**
 * Load the runner payload for one (moduleAttemptId, position) tuple.
 * Returns ActionResult<LoadTestQuestionResult> so the client can
 * branch on `res.ok` (auth / unexpected failure) and then on
 * `result.kind` (ok / redirect / not_found).
 */
export async function loadTestQuestionAction(
  input: LoadTestQuestionInput,
): Promise<ActionResult<{ result: LoadTestQuestionResult }>> {
  let user: { id: string };
  let role: UserRole;
  let supabase: unknown;
  try {
    const ctx = await requireUser();
    user = ctx.user;
    role = ctx.profile.role as UserRole;
    supabase = ctx.supabase;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    return { ok: false, error: message };
  }

  try {
    const result = await loadTestQuestion(
      { userId: user.id, role, supabase },
      input,
    );
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load question';
    return { ok: false, error: message };
  }
}
