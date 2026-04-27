// Server Actions for the Review page.
//
// Two flows:
//   createWeakQueueDrill — picks the student's weakest questions
//     across the whole bank (Smart Review scoring on v2) and starts
//     a review session.
//   createSkillDrill     — same, but scoped to one skill_name
//     (the Common Errors card sends the skill as a hidden field).
//
// Both materialize a practice_sessions row in mode='review' and
// redirect into the runner; the runner's session-complete flow
// already bounces mode='review' sessions back to /review.
//
// Legacy createReviewSession read from question_status (v1). That
// table isn't maintained on the v2 submit path so it had been
// silently going dark as traffic moved over. Replaced wholesale.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { buildWeakQueue } from '@/lib/practice/weak-queue';

const MAX_DRILL_SIZE = 25;
const MIN_DRILL_SIZE = 5;
const DEFAULT_DRILL_SIZE = 10;

export async function createWeakQueueDrill(_prevState, formData) {
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

  const size = clampSize(formData.get('size'));
  const scored = await buildWeakQueue(supabase, user.id);
  if (scored.length === 0) {
    return actionFail(
      'Nothing to review yet. Finish some practice or an assignment first — anything you get wrong will show up here.',
    );
  }

  const questionIds = scored.slice(0, size).map((r) => r.question_id);
  return startReviewSession(supabase, user.id, questionIds, {
    kind: 'weak_queue',
    size,
  });
}

export async function createSkillDrill(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  const rl = await rateLimit(`review-skill:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many review sessions started. Please wait a moment.');
  }

  const skillName = String(formData.get('skill') ?? '').trim();
  if (!skillName) return actionFail('Missing skill.');
  const size = clampSize(formData.get('size'));

  const scored = await buildWeakQueue(supabase, user.id, { skillName });
  if (scored.length === 0) {
    return actionFail(`No questions to review in ${skillName} yet.`);
  }

  const questionIds = scored.slice(0, size).map((r) => r.question_id);
  return startReviewSession(supabase, user.id, questionIds, {
    kind: 'skill',
    skill: skillName,
    size,
  });
}

// ──────────────────────────────────────────────────────────────

function clampSize(raw) {
  const n = Math.floor(Number(raw ?? DEFAULT_DRILL_SIZE));
  if (!Number.isFinite(n)) return DEFAULT_DRILL_SIZE;
  return Math.min(Math.max(n, MIN_DRILL_SIZE), MAX_DRILL_SIZE);
}

async function startReviewSession(supabase, userId, questionIds, filterMeta) {
  const { data: session, error } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: userId,
      test_type: 'sat',
      mode: 'review',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: filterMeta,
    })
    .select('id')
    .single();

  if (error || !session) {
    return actionFail(`Failed to create review session: ${error?.message ?? 'unknown'}`);
  }
  redirect(`/practice/s/${session.id}/0`);
}
