// Server Actions for starting a practice session. See
// docs/architecture-plan.md §3.7, §3.9.
//
// createSession is the only way into the practice flow. It reads the
// student's filter selection, queries a candidate list of question
// ids from the taxonomy + is_published + is_broken filters, shuffles
// and caps, writes a practice_sessions row, then redirects to the
// opaque session-position URL. The client never sees the question
// ids — it just sees the sessionId and position 0.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';

const MAX_SESSION_SIZE = 25;

/**
 * Create a practice session and redirect the student into it.
 *
 * Form fields (all optional):
 *   - domain[]:    array of domain_name values
 *   - difficulty[]: array of integer difficulty values (1-3)
 *   - score_bands[]: array of integer score_band values
 *   - skill[]:     array of skill_name values
 *   - size:        integer 1..MAX_SESSION_SIZE (defaults to 10)
 *
 * Returns: throws via redirect() on success; actionFail otherwise.
 */
export async function createSession(_prevState, formData) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase } = ctx;

  // Rate limit: at most 20 sessions per minute per user. Generous for
  // real students, restrictive for scrapers abusing the endpoint to
  // reveal filtered question id sets. See §3.7 scraper-signal wiring.
  const rl = await rateLimit(`practice-start:${user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return actionFail('Too many session starts. Please wait a moment and try again.');
  }

  const domains = formData.getAll('domain').filter(Boolean).map(String);
  const difficulties = formData
    .getAll('difficulty')
    .map((d) => Number(d))
    .filter(Number.isFinite);
  const scoreBands = formData
    .getAll('score_band')
    .map((b) => Number(b))
    .filter(Number.isFinite);
  const skills = formData.getAll('skill').filter(Boolean).map(String);
  const unansweredOnly = formData.get('unanswered_only') === '1';
  const rawSize = Number(formData.get('size') ?? 10);
  const size = Math.min(
    Math.max(Number.isFinite(rawSize) ? Math.floor(rawSize) : 10, 1),
    MAX_SESSION_SIZE,
  );

  // Build the candidate pool from questions_v2 directly — taxonomy
  // is inline on the v2 row, no join needed.
  let query = supabase
    .from('questions_v2')
    .select('id')
    .eq('is_published', true)
    .eq('is_broken', false);

  if (domains.length) query = query.in('domain_name', domains);
  if (difficulties.length) query = query.in('difficulty', difficulties);
  if (scoreBands.length) query = query.in('score_band', scoreBands);
  if (skills.length) query = query.in('skill_name', skills);

  const { data: candidates, error: candErr } = await query.limit(2000);
  if (candErr) {
    return actionFail(`Failed to load candidate questions: ${candErr.message}`);
  }
  if (!candidates || candidates.length === 0) {
    return actionFail('No questions match those filters. Try a broader selection.');
  }

  let candidateIds = candidates.map((row) => row.id);

  if (unansweredOnly && candidateIds.length > 0) {
    // Filter out questions the student has already answered. question_status
    // has attempts_count > 0 for any question they've attempted.
    const { data: answered } = await supabase
      .from('question_status')
      .select('question_id')
      .eq('user_id', user.id)
      .gt('attempts_count', 0)
      .in('question_id', candidateIds);
    const answeredSet = new Set((answered ?? []).map((r) => r.question_id));
    candidateIds = candidateIds.filter((id) => !answeredSet.has(id));
    if (candidateIds.length === 0) {
      return actionFail('You\'ve already answered every question matching those filters. Try broader filters or uncheck "unanswered only".');
    }
  }

  // Shuffle and cap. Fisher-Yates — a single pass, no bias.
  const ids = candidateIds;
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const questionIds = ids.slice(0, size);

  // Persist the session. RLS on practice_sessions guarantees this row
  // is only ever read by user_id = auth.uid().
  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'practice',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: {
        domains,
        difficulties,
        scoreBands,
        skills,
        unansweredOnly,
        size,
      },
    })
    .select('id')
    .single();

  if (insertErr || !session) {
    return actionFail(`Failed to create session: ${insertErr?.message ?? 'unknown'}`);
  }

  // Hand the student off to the opaque session URL. Note: redirect()
  // throws internally, so nothing after this line runs on success.
  redirect(`/practice/s/${session.id}/0`);
}
