// Training-mode parallel of /app/next/(student)/review/actions.js.
// Same scoring + session-creation, role-gated to teachers and
// scoped to mode='training'. Both flows materialize a
// practice_sessions row whose mode forces the runner's complete-
// redirect to land back on /tutor/training/review.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { buildWeakQueue } from '@/lib/practice/weak-queue';

const MAX_DRILL_SIZE = 25;
const MIN_DRILL_SIZE = 5;
const DEFAULT_DRILL_SIZE = 10;

export async function createTrainingWeakQueueDrill(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, profile, supabase } = ctx;
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    return actionFail('Training is for teachers, managers, and admins.');
  }

  const rl = await rateLimit(`training-review:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) return actionFail('Too many review sessions. Please wait a moment.');

  const size = clampSize(formData.get('size'));
  const scored = await buildWeakQueue(supabase, user.id);
  if (scored.length === 0) {
    return actionFail(
      'Nothing to review yet. Finish a training session first — anything you get wrong shows up here.',
    );
  }
  const questionIds = scored.slice(0, size).map((r) => r.question_id);
  return startReviewSession(supabase, user.id, questionIds, { kind: 'weak_queue', size });
}

export async function createTrainingSkillDrill(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, profile, supabase } = ctx;
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) {
    return actionFail('Training is for teachers, managers, and admins.');
  }

  const rl = await rateLimit(`training-skill:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) return actionFail('Too many review sessions. Please wait a moment.');

  const skillName = String(formData.get('skill') ?? '').trim();
  if (!skillName) return actionFail('Missing skill.');
  const size = clampSize(formData.get('size'));

  const scored = await buildWeakQueue(supabase, user.id, { skillName });
  if (scored.length === 0) return actionFail(`No questions to review in ${skillName} yet.`);

  const questionIds = scored.slice(0, size).map((r) => r.question_id);
  return startReviewSession(supabase, user.id, questionIds, { kind: 'skill', skill: skillName, size });
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
      mode: 'training',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: { ...filterMeta, source: 'training_review' },
    })
    .select('id')
    .single();
  if (error || !session) {
    return actionFail(`Failed to create review session: ${error?.message ?? 'unknown'}`);
  }
  redirect(`/tutor/training/practice/s/${session.id}/0`);
}
