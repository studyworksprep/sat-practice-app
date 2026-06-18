// Server Actions for the ACT practice-tests hub.
//
// Practice tests on ACT are virtual constructs over act_questions
// sliced by source_test (see docs/architecture-plan.md §3.4
// "ACT practice tests as virtual constructs"). There is no
// parallel `act_practice_test_*` family — every test is a
// deterministic slice of act_questions, ordered by source_ordinal,
// run through the unified practice runner (PR 5).
//
// Two surfaces this file owns:
//
//   - startActPracticeTest: creates a practice_sessions row with
//     test_type='act', filter_criteria carrying source_test +
//     kind='practice_test' + section + deadlineAt. The session's
//     question_ids are the source-test slice in source_ordinal
//     order — the runner consumes them unchanged.
//
//   - finalizeActPracticeTest: called from the runner's Submit Set
//     flow when the session is an ACT practice test. Reads the
//     student's act_attempts inside the session window, computes
//     raw correct per section, looks up scaled scores in
//     act_score_conversion (returns null when the lookup is empty),
//     upserts an act_practice_test_attempts row, returns the
//     attempt id so the client can redirect to the results page.
//
// act_score_conversion is empty on prod today. The finalize path
// writes raw counts and leaves scaled fields null; the results
// page degrades gracefully with a "scaled scores pending" note.

'use server';

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { rateLimit } from '@/lib/api/rateLimit';
import type { ActionResult } from '@/lib/types';

// Per-section time limits in milliseconds. Matches the standard
// administration of the ACT today; the enhanced 2025 ACT shortens
// the math section to 50 minutes, so a future form-keyed override
// can land here when content for that format does. For now the
// classic timings cover everything seeded.
const ACT_SECTION_TIME_MS: Record<string, number> = {
  english: 75 * 60 * 1000, // 75 min
  math:    60 * 60 * 1000, // 60 min
  reading: 35 * 60 * 1000, // 35 min
  science: 35 * 60 * 1000, // 35 min
};

/** Compute the section time limit for a single-section ACT
 *  practice test. Returns null when the section isn't recognized
 *  so the runner can render without a timer rather than crash. */
function sectionTimeMs(section: string | null): number | null {
  if (!section) return null;
  return ACT_SECTION_TIME_MS[section] ?? null;
}

/**
 * Start an ACT practice test for the given source_test. The action
 * builds the deterministic question_ids slice, creates the
 * practice_sessions row, and redirects into the runner at position 0.
 */
export async function startActPracticeTest(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult | null> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { user, supabase } = ctx as { user: { id: string }; supabase: any };

  // Same per-user rate limit as the other practice-start paths so
  // tab-hopping can't bypass it.
  const rl = await rateLimit(`practice-start:${user.id}`, { limit: 20, windowMs: 60_000 });
  if (!rl.ok) return actionFail('Too many session starts. Please wait and try again.');

  const sourceTest = String(formData.get('source_test') ?? '').trim();
  if (!sourceTest) return actionFail('Pick a test form.');

  // Build the deterministic slice. Order is source_ordinal ascending —
  // that's the natural sequence the test was administered in.
  const { data: questionRows, error: queryErr } = await supabase
    .from('act_questions')
    .select('id, section, source_ordinal')
    .eq('source_test', sourceTest)
    .eq('is_broken', false)
    .order('source_ordinal', { ascending: true });
  if (queryErr) {
    return actionFail(`Could not load test questions: ${queryErr.message}`);
  }
  const questionIds: string[] = (questionRows ?? []).map(
    (r: { id: string }) => r.id,
  );
  if (questionIds.length === 0) {
    return actionFail('This test form has no questions yet.');
  }

  // ACT forms seeded today are single-section. Pick the section the
  // first question carries; if a form ever ships with multiple
  // sections, the practice-test page will need to either split into
  // section-by-section attempts or use a section-aware timer per
  // batch — out of scope for PR 7 since no such form exists.
  const sections = new Set<string>(
    (questionRows ?? []).map((r: { section: string }) => r.section),
  );
  const single = sections.size === 1 ? sections.values().next().value : null;

  const timeMs = single ? sectionTimeMs(single) : null;
  const deadlineAt = timeMs
    ? new Date(Date.now() + timeMs).toISOString()
    : null;

  const { data: session, error: insertErr } = await supabase
    .from('practice_sessions')
    .insert({
      user_id: user.id,
      test_type: 'act',
      mode: 'practice',
      question_ids: questionIds,
      current_position: 0,
      filter_criteria: {
        kind: 'practice_test',
        source_test: sourceTest,
        sectionsOnly: single ?? null,
        deadlineAt,
      },
    })
    .select('id')
    .single();
  if (insertErr || !session) {
    return actionFail(`Failed to start test: ${insertErr?.message ?? 'unknown'}`);
  }

  redirect(`/practice/s/${session.id}/0`);
}

/**
 * Finalize an ACT practice-test session. Called from
 * submitPracticeSession (lib/practice/session-actions.ts) when the
 * session's filter_criteria.kind === 'practice_test' and
 * test_type === 'act'. Idempotent — re-finalizing an already
 * finalized attempt updates the cached row in place.
 *
 * Returns the act_practice_test_attempts.id so the caller can
 * redirect the client to the ACT results page.
 */
export async function finalizeActPracticeTest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  sessionId: string,
): Promise<{ ok: true; attemptId: string } | { ok: false; error: string }> {
  // Re-confirm session ownership + shape. Belt-and-suspenders since
  // submitPracticeSession already did this, but keep this helper
  // self-contained so it can be reused from other entry points.
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, test_type, filter_criteria')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: 'Session not found' };
  if (session.user_id !== userId) return { ok: false, error: 'Session not found' };
  if (session.test_type !== 'act') return { ok: false, error: 'Not an ACT session' };
  const fc = (session.filter_criteria ?? {}) as Record<string, unknown>;
  const sourceTest = typeof fc.source_test === 'string' ? fc.source_test : null;
  if (!sourceTest) return { ok: false, error: 'Not a practice test' };

  const questionIds: string[] = Array.isArray(session.question_ids)
    ? session.question_ids
    : [];

  // Per-section raw correct counts from the attempts table. We pull
  // the section off act_questions once and bucket the per-question
  // first-attempts onto it.
  const [{ data: meta }, { data: attempts }] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from('act_questions')
          .select('id, section')
          .in('id', questionIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('act_attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .in('question_id', questionIds.length > 0 ? questionIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', session.created_at ?? '1970-01-01T00:00:00Z'),
  ]);

  const sectionByQid = new Map<string, string>();
  for (const r of (meta ?? []) as Array<{ id: string; section: string }>) {
    sectionByQid.set(r.id, r.section);
  }

  // First-attempt wins per question, consistent with the runner +
  // review aggregator.
  const firstByQid = new Map<string, { is_correct: boolean }>();
  const sortedAttempts = ((attempts ?? []) as Array<{
    question_id: string;
    is_correct: boolean;
    created_at: string;
  }>).sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  for (const a of sortedAttempts) {
    if (!firstByQid.has(a.question_id)) firstByQid.set(a.question_id, a);
  }

  const rawCorrect: Record<string, number> = {
    english: 0, math: 0, reading: 0, science: 0,
  };
  for (const qid of questionIds) {
    const sec = sectionByQid.get(qid);
    const a = firstByQid.get(qid);
    if (sec && a?.is_correct && sec in rawCorrect) {
      rawCorrect[sec] += 1;
    }
  }

  // Look up scaled scores. act_score_conversion is empty on prod
  // today — every lookup returns null and the corresponding scaled
  // column stays null. The results page reads these and shows
  // "scaled scores pending" inline.
  const scaled: Record<string, number | null> = {
    english: null, math: null, reading: null, science: null,
  };
  for (const sec of ['english', 'math', 'reading', 'science'] as const) {
    if (rawCorrect[sec] === 0) continue;
    const { data } = await supabase
      .from('act_score_conversion')
      .select('scaled_score')
      .eq('source_test', sourceTest)
      .eq('section', sec)
      .eq('raw_score', rawCorrect[sec])
      .maybeSingle();
    if (data?.scaled_score != null) {
      scaled[sec] = Number(data.scaled_score);
    }
  }

  // Composite — rounded average of the four section scales. Only
  // computable when all four are present; otherwise leave null so
  // the results page can show a section-only line.
  const sectionScales = [scaled.english, scaled.math, scaled.reading, scaled.science];
  const composite = sectionScales.every((v) => v != null)
    ? Math.round((sectionScales as number[]).reduce((a, b) => a + b, 0) / 4)
    : null;

  // Upsert by practice_session_id so re-finalizing (e.g. a tutor
  // clicks Submit Set again on behalf of the student) refreshes the
  // cached scores in place rather than creating a duplicate.
  // ACT practice attempts have no natural primary key beyond
  // session, so we check first then insert/update.
  const { data: existing } = await supabase
    .from('act_practice_test_attempts')
    .select('id')
    .eq('practice_session_id', sessionId)
    .maybeSingle();

  let attemptId: string;
  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('act_practice_test_attempts')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        english_scaled: scaled.english,
        math_scaled: scaled.math,
        reading_scaled: scaled.reading,
        science_scaled: scaled.science,
        composite_score: composite,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updateErr) return { ok: false, error: updateErr.message };
    attemptId = existing.id as string;
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('act_practice_test_attempts')
      .insert({
        user_id: userId,
        source_test: sourceTest,
        status: 'completed',
        finished_at: new Date().toISOString(),
        english_scaled: scaled.english,
        math_scaled: scaled.math,
        reading_scaled: scaled.reading,
        science_scaled: scaled.science,
        composite_score: composite,
        practice_session_id: sessionId,
      })
      .select('id')
      .single();
    if (insertErr || !inserted) return { ok: false, error: insertErr?.message ?? 'insert failed' };
    attemptId = (inserted as { id: string }).id;
  }

  return { ok: true, attemptId };
}
