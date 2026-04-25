// Server Actions for the tutor training practice page.
//
// createTrainingSession is the training-mode parallel of the
// student createSession (app/next/(student)/practice/start/
// actions.js). Same scoring, same v2 candidate query, same
// largest-remainder shuffle — the only differences from the
// student flow:
//
//   - role gate accepts teacher / manager / admin; students
//     bounce to their own /practice/start
//   - mode='training' on the inserted practice_sessions row, so
//     a teacher's training data never gets confused with the
//     student-practice telemetry the dashboard panels assume
//   - rate-limit bucket prefix distinguishes the buckets
//
// countAvailable + the grading flow (submitAnswer +
// submitPracticeSession + abandonPracticeSession) are imported
// straight from lib/practice — they don't need a training
// variant because the work is identical.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { fetchAll } from '@/lib/supabase/fetchAll';

const MAX_SESSION_SIZE = 50;
const ORDER_OPTIONS = new Set(['display_code', 'random', 'easy_first', 'hard_first']);

export async function createTrainingSession(_prev, formData) {
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

  const rl = await rateLimit(`training-start:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many session starts. Please wait a moment and try again.');
  }

  const filters = parseFilters(formData);

  const candidateIds = await loadCandidateIds(supabase, filters);
  if (candidateIds == null) return actionFail('Failed to load candidate questions.');

  const poolIds = filters.unansweredOnly
    ? await dropAnswered(supabase, user.id, candidateIds)
    : candidateIds;

  if (poolIds.length === 0) {
    return actionFail(
      filters.unansweredOnly
        ? 'No unanswered questions match those filters. Try broadening or turn off "only unanswered".'
        : 'No questions match those filters. Try a broader selection.',
    );
  }

  const ordered = await orderIds(supabase, poolIds, filters.order);
  const sliced = ordered.slice(0, filters.size);

  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'training',
      question_ids: sliced,
      current_position: 0,
      filter_criteria: {
        domains: filters.domains,
        difficulties: filters.difficulties,
        score_bands: filters.scoreBands,
        skills: filters.skills,
        unansweredOnly: filters.unansweredOnly,
        order: filters.order,
        size: filters.size,
        actual_size: sliced.length,
      },
    })
    .select('id')
    .single();

  if (insertErr || !session) {
    return actionFail(`Failed to create session: ${insertErr?.message ?? 'unknown'}`);
  }

  redirect(`/tutor/training/practice/s/${session.id}/0`);
}

// ──────────────────────────────────────────────────────────────
// Helpers (parallel to the student createSession internals).
// ──────────────────────────────────────────────────────────────

function parseFilters(formData) {
  const domains = formData.getAll('domain').filter(Boolean).map(String);
  const skills = formData.getAll('skill').filter(Boolean).map(String);
  const difficulties = formData.getAll('difficulty').map(Number).filter(Number.isFinite);
  const scoreBands = formData.getAll('score_band').map(Number).filter(Number.isFinite);
  const unansweredOnly = formData.get('unanswered_only') === '1';
  const rawOrder = String(formData.get('order') ?? 'display_code');
  const order = ORDER_OPTIONS.has(rawOrder) ? rawOrder : 'display_code';
  const rawSize = Number(formData.get('size') ?? 10);
  const size = Math.min(
    Math.max(Number.isFinite(rawSize) ? Math.floor(rawSize) : 10, 1),
    MAX_SESSION_SIZE,
  );
  return { domains, skills, difficulties, scoreBands, unansweredOnly, order, size };
}

async function loadCandidateIds(supabase, filters) {
  try {
    const rows = await fetchAll((from, to) => {
      let query = supabase
        .from('questions_v2')
        .select('id')
        .eq('is_published', true)
        .eq('is_broken', false)
        .is('deleted_at', null);

      if (filters.domains.length)      query = query.in('domain_name', filters.domains);
      if (filters.skills.length)       query = query.in('skill_name',  filters.skills);
      if (filters.difficulties.length) query = query.in('difficulty',  filters.difficulties);
      if (filters.scoreBands.length)   query = query.in('score_band',  filters.scoreBands);

      return query.range(from, to);
    });
    return rows.map((r) => r.id);
  } catch {
    return null;
  }
}

async function dropAnswered(supabase, userId, candidateIds) {
  if (candidateIds.length === 0) return candidateIds;
  const { data: answered } = await supabase
    .from('attempts')
    .select('question_id')
    .eq('user_id', userId)
    .in('question_id', candidateIds);
  const answeredSet = new Set((answered ?? []).map((r) => r.question_id));
  return candidateIds.filter((id) => !answeredSet.has(id));
}

async function orderIds(supabase, ids, order) {
  if (ids.length === 0) return ids;

  if (order === 'random') {
    const a = [...ids];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const { data } = await supabase
    .from('questions_v2')
    .select('id, display_code, difficulty')
    .in('id', ids);
  const byId = new Map((data ?? []).map((r) => [r.id, r]));

  if (order === 'easy_first' || order === 'hard_first') {
    const dir = order === 'easy_first' ? 1 : -1;
    return [...ids].sort((a, b) => {
      const da = byId.get(a)?.difficulty ?? 0;
      const db = byId.get(b)?.difficulty ?? 0;
      if (da !== db) return (da - db) * dir;
      const ca = byId.get(a)?.display_code ?? '';
      const cb = byId.get(b)?.display_code ?? '';
      return ca.localeCompare(cb);
    });
  }

  return [...ids].sort((a, b) => {
    const ca = byId.get(a)?.display_code ?? '';
    const cb = byId.get(b)?.display_code ?? '';
    return ca.localeCompare(cb);
  });
}

/**
 * Live-count Server Action, used by StartInteractive to render
 * the "N questions match" pill. Mirror of the student's
 * countAvailable but role-gated to teachers only.
 */
export async function countAvailable(_prev, formData) {
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

  const filters = parseFilters(formData);
  const candidateIds = await loadCandidateIds(supabase, filters);
  if (candidateIds == null) return actionFail('Failed to load candidate questions.');
  const finalIds = filters.unansweredOnly
    ? await dropAnswered(supabase, user.id, candidateIds)
    : candidateIds;
  return { ok: true, count: finalIds.length };
}
