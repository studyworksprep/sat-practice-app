// Server Actions for starting a practice session.
//
// The student-visible flow:
//   1. GET /practice/start — filter form + live "Questions available"
//      count. Filters tied to URL are the single source of truth;
//      the client island reads them back and updates the count as
//      the student tweaks the form.
//   2. POST createSession — server validates filters, pulls the
//      full candidate set from questions_v2, drops rows the
//      student has already answered if requested, orders per the
//      `order` param (default display_code asc), slices to the
//      requested size (or smaller if fewer matched), writes a
//      practice_sessions row, and redirects to /practice/s/[id]/0.
//
// Fixed-list philosophy (see discussion at the top of
// /admin/content/drafts/[draftId]/page.js for contrast): every
// session is a pre-determined walk through a known list. The
// practice page itself knows nothing about filters — it just loads
// question_ids[position] and renders.
//
// "Unanswered only" queries `attempts` rather than the legacy
// question_status table. question_status was keyed on v1
// questions.id; v2 UUIDs don't resolve there. attempts carries v2
// UUIDs natively on the new-tree submission path, so that's the
// authoritative source for "has this student already answered?"

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import { fetchAll } from '@/lib/supabase/fetchAll';

const MAX_SESSION_SIZE = 50;

// Order options for the generated question list. 'display_code'
// is the natural author-intended sequence (M-00001, M-00002, …);
// choosing another order is a deliberate action on the student's
// part (e.g. "random" before a simulated test drill).
const ORDER_OPTIONS = new Set(['display_code', 'random', 'easy_first', 'hard_first']);

// ──────────────────────────────────────────────────────────────
// countAvailable — returns the number of questions that would
// match the current filter selection. Used by the start page's
// live count display. No side effects; safe to poll.
// ──────────────────────────────────────────────────────────────

export async function countAvailable(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;
  const filters = parseFilters(formData);

  const candidateIds = await loadCandidateIds(supabase, filters);
  if (candidateIds == null) return actionFail('Failed to load candidate questions.');
  const finalIds = filters.unansweredOnly
    ? await dropAnswered(supabase, user.id, candidateIds)
    : candidateIds;

  return { ok: true, count: finalIds.length };
}

// ──────────────────────────────────────────────────────────────
// createSession — the one entry into the practice flow.
// ──────────────────────────────────────────────────────────────

export async function createSession(_prev, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  // Rate limit: at most 20 sessions per minute per user. Tight
  // against scrapers fishing for filtered question-id sets;
  // generous for real students.
  const rl = await rateLimit(`practice-start:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return actionFail('Too many session starts. Please wait and try again.');

  const filters = parseFilters(formData);

  const candidateIds = await loadCandidateIds(supabase, filters);
  if (candidateIds == null) return actionFail('Failed to load candidate questions.');

  const poolIds = filters.unansweredOnly
    ? await dropAnswered(supabase, user.id, candidateIds)
    : candidateIds;

  if (poolIds.length === 0) {
    return actionFail(filters.unansweredOnly
      ? 'No unanswered questions match those filters. Try broadening or turn off "only unanswered".'
      : 'No questions match those filters. Try a broader selection.');
  }

  // Order. We work with just IDs at this stage, so any order
  // other than display_code or random needs a follow-up fetch for
  // sort-key fields. Keeping that simple: easy_first / hard_first
  // fetch difficulty for the pool, then sort in memory. Memory
  // cost is trivial at pool sizes ≤ 5,000.
  const ordered = await orderIds(supabase, poolIds, filters.order);
  const sliced = ordered.slice(0, filters.size);

  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'practice',
      question_ids: sliced,
      current_position: 0,
      filter_criteria: {
        domains:        filters.domains,
        difficulties:   filters.difficulties,
        score_bands:    filters.scoreBands,
        skills:         filters.skills,
        unansweredOnly: filters.unansweredOnly,
        order:          filters.order,
        size:           filters.size,
        actual_size:    sliced.length,
      },
    })
    .select('id')
    .single();

  if (insertErr || !session) {
    return actionFail(`Failed to create session: ${insertErr?.message ?? 'unknown'}`);
  }

  redirect(`/practice/s/${session.id}/0`);
}

// ──────────────────────────────────────────────────────────────
// Helpers.
// ──────────────────────────────────────────────────────────────

function parseFilters(formData) {
  const domains        = formData.getAll('domain').filter(Boolean).map(String);
  const skills         = formData.getAll('skill').filter(Boolean).map(String);
  const difficulties   = formData.getAll('difficulty').map(Number).filter(Number.isFinite);
  const scoreBands     = formData.getAll('score_band').map(Number).filter(Number.isFinite);
  const unansweredOnly = formData.get('unanswered_only') === '1';
  const rawOrder       = String(formData.get('order') ?? 'display_code');
  const order          = ORDER_OPTIONS.has(rawOrder) ? rawOrder : 'display_code';
  const rawSize        = Number(formData.get('size') ?? 10);
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

/**
 * Drop IDs the student has already answered. Sourced from
 * attempts (v2-native) rather than the legacy question_status
 * table, which is keyed on v1 question IDs.
 */
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

/**
 * Apply the requested order to the candidate IDs. display_code /
 * random can be done with just the IDs we already have; the
 * difficulty-ordered variants need a second query for the sort
 * key.
 */
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

  // display_code, easy_first, hard_first all need a sort-key
  // fetch. display_code is by far the most common case and maps
  // to the most natural "walk through the bank" sequence.
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
      // Tie-break by display_code for determinism.
      const ca = byId.get(a)?.display_code ?? '';
      const cb = byId.get(b)?.display_code ?? '';
      return ca.localeCompare(cb);
    });
  }

  // display_code ascending (default).
  return [...ids].sort((a, b) => {
    const ca = byId.get(a)?.display_code ?? '';
    const cb = byId.get(b)?.display_code ?? '';
    return ca.localeCompare(cb);
  });
}
