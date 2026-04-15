// Server Action for the review page: createReviewSession.
//
// Builds a practice_sessions row with mode='review' from the
// student's question_status table (wrong answers, marked items,
// or both, depending on the form's `filter` field), then redirects
// to the existing student practice session page at
// /practice/s/[id]/0. The practice session page detects mode='review'
// and adjusts the session-complete redirect to come back here.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';

const MAX_REVIEW_SIZE = 25;

export async function createReviewSession(_prevState, formData) {
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

  const filter = String(formData.get('filter') ?? 'wrong');

  // Build the candidate query. RLS scopes question_status to the
  // current user already; we just filter on the wrong/marked flags.
  let query = supabase
    .from('question_status')
    .select('question_id, last_attempt_at')
    .eq('user_id', user.id);

  if (filter === 'wrong') {
    query = query.eq('last_is_correct', false);
  } else if (filter === 'marked') {
    query = query.eq('marked_for_review', true);
  } else {
    // 'both' / default — anything wrong OR marked
    query = query.or('last_is_correct.eq.false,marked_for_review.eq.true');
  }

  const { data: rows, error: queryErr } = await query
    .order('last_attempt_at', { ascending: false })
    .limit(2000);

  if (queryErr) {
    return actionFail(`Failed to load review pool: ${queryErr.message}`);
  }
  if (!rows || rows.length === 0) {
    return actionFail('Nothing to review in that pool.');
  }

  // Take the most recent N. No shuffle here — students reviewing
  // wrong answers usually want the freshest mistakes first, not a
  // random sample.
  const questionIds = rows.slice(0, MAX_REVIEW_SIZE).map((r) => r.question_id);

  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'sat',
      mode: 'review',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: { filter },
    })
    .select('id')
    .single();

  if (insertErr || !session) {
    return actionFail(`Failed to create review session: ${insertErr?.message ?? 'unknown'}`);
  }

  // Hand the student off to the existing practice session UI.
  // The practice page handles mode='review' specifically by
  // pre-revealing the rationale and routing the
  // session-complete redirect back here.
  redirect(`/practice/s/${session.id}/0`);
}
