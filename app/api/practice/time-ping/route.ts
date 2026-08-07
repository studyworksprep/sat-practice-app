// Practice-session time-ping — accepts a time-only delta for a
// question in a practice session and accumulates it into the
// matching attempts / act_attempts row. The session-runner sibling
// of /api/practice-test/time-ping: it exists for the same reason
// (navigator.sendBeacon needs a stable URL, which Server Actions
// don't have) and is called from PracticeInteractive on
// visibilitychange / pagehide / navigation to flush post-submit
// reading time durably.
//
// One deliberate difference from the practice-test route: this one
// NEVER inserts a placeholder attempts row. In practice sessions an
// attempts row means "the student answered" — mastery
// (get_skill_mastery_asof), the review queue intake, and the session
// review report all key off its existence — so a viewed-but-never-
// answered question must not grow a row just to hold timing. Time
// for unanswered questions is accumulated client-side and rides on
// the submitAnswer call if/when the student answers; if they never
// do, the time is dropped (the review UI already renders "no
// timing" for those).
//
// Accumulation is atomic via the increment_attempt_time /
// increment_act_attempt_time RPCs (20260807120000 migration), so a
// beacon racing a concurrent submit can't lose either delta.

import { requireUser } from '@/lib/api/auth';
import { ok, fail, apiRoute } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

// Matches the practice-test time-ping clamp; the RPC clamps again.
const MAX_DELTA_MS = 3_600_000;

export const POST = apiRoute(async (req: Request) => {
  // Auth before touching the (untrusted) body — an unauthenticated
  // caller gets 401 regardless of payload. requireUser throws
  // ApiError, which legacyApiRoute converts.
  const { user, supabase } = await requireUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('Invalid body', 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const sessionId = String(b.sessionId ?? '');
  const position = Number(b.position);
  const rawDelta = Number(b.timeSpentMs ?? 0);
  const timeDelta = Number.isFinite(rawDelta) && rawDelta > 0
    ? Math.min(Math.round(rawDelta), MAX_DELTA_MS)
    : 0;

  if (!sessionId || !Number.isInteger(position) || position < 0 || timeDelta === 0) {
    return ok({ skipped: true });
  }

  // Beacons fire on hide/nav — a real student produces a few per
  // minute. Same per-user limiter the submit action uses, sized
  // generously above any human rate.
  const rl = await rateLimit(`practice-time-ping:${user.id}`, {
    limit: 240,
    windowMs: 60_000,
  });
  if (!rl.ok) return fail('Too many requests', 429);

  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, test_type, status, expires_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.user_id !== user.id) {
    return fail('Session not found', 404);
  }

  // Late pings against a dead session shouldn't bill anything — a
  // stale tab the student forgot about can beacon hours later.
  // 'completed' IS accepted: the finish flow's last flush races the
  // submitPracticeSession status flip, and post-submit reading time
  // on the final question is legitimately part of the session.
  if (session.status === 'abandoned') return ok({ skipped: true });
  if (
    session.status === 'in_progress'
    && session.expires_at
    && new Date(session.expires_at) < new Date()
  ) {
    return ok({ skipped: true });
  }

  const questionIds: string[] = Array.isArray(session.question_ids)
    ? session.question_ids.filter((q): q is string => typeof q === 'string')
    : [];
  if (position >= questionIds.length) return ok({ skipped: true });
  const questionId = questionIds[position];
  const sessionFloor = session.created_at ?? '1970-01-01T00:00:00Z';

  // First attempt inside the session window — the same
  // first-attempt-wins row submitAnswer targets.
  const table = session.test_type === 'act' ? 'act_attempts' : 'attempts';
  const { data: attempt } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .gte('created_at', sessionFloor)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Not answered yet → nothing to accumulate onto (see header).
  if (!attempt) return ok({ skipped: true });

  const { error } = await supabase.rpc(
    session.test_type === 'act' ? 'increment_act_attempt_time' : 'increment_attempt_time',
    { p_attempt_id: attempt.id, p_delta_ms: timeDelta },
  );
  if (error) return fail(`Could not record time: ${error.message}`, 500);

  return ok({ recorded: true });
});
