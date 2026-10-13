// Server Action for the Review hub's "Due for review" card (§3.1).
//
// createDueReviewSession turns the student's due review_queue items
// into a practice session: due question items first, then micro-
// drills for due (decayed) skills — built by
// lib/review/queue.buildReviewSessionQuestionIds. The session runs
// mode='review' through the normal runner, so answering each
// question flows back through submitAnswer's queue bookkeeping and
// advances (or lapses) that item's schedule.
//
// Sibling to ./actions.js (the weak-queue drills); new file because
// the TypeScript ratchet wants new files typed.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import {
  buildReviewSessionQuestionIds,
  getDueReviewItems,
  syncDecayedSkillReviews,
} from '@/lib/review/queue';
import type { ActionResult } from '@/lib/types';

const REVIEW_SESSION_SIZE = 10;

export async function createDueReviewSession(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<never>> {
  // Which bank's due items to run. One session is one test type
  // (the runner forks on practice_sessions.test_type), so the Review
  // hub offers a launcher per test type that has items due.
  const testType = String(formData?.get?.('test_type') ?? 'sat') === 'act' ? 'act' : 'sat';
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const rl = await rateLimit(`review-start:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many review sessions started. Please wait a moment.');
  }

  const nowIso = new Date().toISOString();
  if (testType === 'sat') {
    try {
      await syncDecayedSkillReviews(supabase, user.id);
    } catch {
      // Best-effort — a stale skill list just means this session leans
      // on question items; the next visit reconciles.
    }
  }
  const due = await getDueReviewItems(supabase, user.id, nowIso);
  const questionIds = await buildReviewSessionQuestionIds(
    supabase, user.id, due, REVIEW_SESSION_SIZE, testType,
  );
  if (questionIds.length === 0) {
    return actionFail(
      testType === 'act'
        ? 'Nothing due for ACT review right now. ACT questions you miss in practice queue up here automatically.'
        : 'Nothing due for review right now. Missed questions and slipping skills queue up here automatically as you practice.',
    );
  }

  const { data: session, error } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: testType,
      mode: 'review',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: { kind: 'srs_due', size: questionIds.length },
    })
    .select('id')
    .single();
  if (error || !session) {
    return actionFail(`Failed to create review session: ${error?.message ?? 'unknown'}`);
  }
  redirect(`/practice/s/${session.id}/0`);
}
