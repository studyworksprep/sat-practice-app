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
import { buildWeakQueue, selectDrillQuestionIds } from '@/lib/practice/weak-queue';
import { buildWeakQueueAct } from '@/lib/practice/weak-queue-act';

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

  const questionIds = selectDrillQuestionIds(scored, size);
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

  const questionIds = selectDrillQuestionIds(scored, size);
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

async function startReviewSession(supabase, userId, questionIds, filterMeta, testType = 'sat') {
  const { data: session, error } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: userId,
      test_type: testType,
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

// ──────────────────────────────────────────────────────────────
// ACT counterparts. Same scoring formula as SAT (the weak-queue-act
// helper carries the per-section adjustment), same drill flow, same
// review-session creation — only the candidate pool + test_type
// stamp differ. The runner forks on session.test_type (PR 5).
// ──────────────────────────────────────────────────────────────

export async function createActWeakQueueDrill(_prevState, formData) {
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
  const scored = await buildWeakQueueAct(supabase, user.id);
  if (scored.length === 0) {
    return actionFail(
      'Nothing to review in ACT yet. Finish some ACT practice first — anything you get wrong will show up here.',
    );
  }

  const questionIds = selectDrillQuestionIds(scored, size);
  return startReviewSession(
    supabase, user.id, questionIds,
    { kind: 'weak_queue', size },
    'act',
  );
}

export async function createActCategoryDrill(_prevState, formData) {
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

  // Field name stays `skill` so the existing SkillDrillButton form
  // can be reused without branching. The value carries the ACT
  // category (the equivalent of an SAT skill in the rendering shape).
  const categoryName = String(formData.get('skill') ?? '').trim();
  if (!categoryName) return actionFail('Missing category.');
  const size = clampSize(formData.get('size'));

  const scored = await buildWeakQueueAct(supabase, user.id, { categoryName });
  if (scored.length === 0) {
    return actionFail(`No questions to review in ${categoryName} yet.`);
  }

  const questionIds = selectDrillQuestionIds(scored, size);
  return startReviewSession(
    supabase, user.id, questionIds,
    { kind: 'category', category: categoryName, size },
    'act',
  );
}
