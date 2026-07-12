// Server Action that returns the per-position runner payload for a
// practice or training session. This is the typed primitive that
// lets PracticeInteractive navigate next/prev *without* a route
// change — see lib/practice/load-question.ts for the loader the
// action wraps and docs/architecture-plan.md §3.7 for why this is
// the sanctioned shape (vs. a bare client fetch).
//
// Auth: requireUser() runs on every call. The loader does its own
// session-ownership check via `practice_sessions.user_id =
// caller`. RLS still gates the underlying tables, so a forged
// sessionId returns not_found rather than another user's data.

'use server';

import { requireUser } from '@/lib/api/auth';
import { loadQuestion } from './load-question';
import type {
  LoadQuestionInput,
  LoadQuestionResult,
} from './load-question';
import type { ActionResult, UserRole } from '@/lib/types';

/**
 * Load the runner payload for one (sessionId, position) tuple.
 * Returns ActionResult<LoadQuestionResult> so the client can branch
 * on `res.ok` (auth / unexpected failure) and then on `result.kind`
 * (ok / removed / expired / etc.). The loader's own discriminants
 * are preserved verbatim so the caller doesn't have to know how
 * the backend distinguishes "session expired" from "ran off the end".
 */
export async function loadQuestionAction(
  input: LoadQuestionInput,
): Promise<ActionResult<{ result: LoadQuestionResult }>> {
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
    const result = await loadQuestion(
      { userId: user.id, role, supabase },
      input,
    );
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load question';
    return { ok: false, error: message };
  }
}
