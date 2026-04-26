// GET /api/review/weak-queue
//
// Replacement for the retired /api/smart-review. The original route
// read from question_status, a v1 aggregation that v2 submit paths
// don't maintain — so it was returning stale data for any user
// whose recent activity was on v2, and was deleted in 8aa4288 along
// with the legacy /app/review tab's loader. This route restores
// Smart Review for users still on ui_version='legacy' by routing
// the legacy tab at lib/practice/weak-queue.buildWeakQueue, the
// v2-native scoring path the new-tree /review page already uses.
//
// Same priority formula as the deleted route, minus the
// marked_for_review +15 bonus (which would require a question_status
// join — re-introducing the staleness problem). The Wrong / Flagged
// pills in the legacy renderer just won't show 'Flagged' — small
// visual diff, no functional regression.
//
// Response shape matches the legacy renderer's expectations
// (attempts_count / correct_attempts_count / days_since_attempt /
// accuracy as 0–100 integer), capped at 50 items.

import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';
import { NextResponse } from 'next/server';
import { buildWeakQueue } from '@/lib/practice/weak-queue';

const MAX_ITEMS = 50;

export const GET = legacyApiRoute(async () => {
  const { user, supabase } = await requireUser();
  const queue = await buildWeakQueue(supabase, user.id);

  const items = queue.slice(0, MAX_ITEMS).map((q) => ({
    question_id: q.question_id,
    domain_name: q.domain_name ?? null,
    skill_name: q.skill_name ?? null,
    difficulty: q.difficulty ?? null,
    attempts_count: q.count ?? 0,
    correct_attempts_count: q.correct ?? 0,
    last_is_correct: q.last_is_correct,
    days_since_attempt: q.days_since != null ? Math.round(q.days_since) : null,
    accuracy: q.count > 0 ? Math.round((q.correct / q.count) * 100) : 0,
    priority: Math.round(q.priority ?? 0),
  }));

  return NextResponse.json({ items });
});
