// Lifecycle of an ACT practice-test attempt (Phase 3 multi-section
// test mode). Server-only library shared by the hub's Server Actions
// (app/(student)/practice/tests/actions.ts), the attempt page and
// submitPracticeSession. Deliberately NOT a 'use server' module: these
// helpers take a Supabase client and must never be reachable as
// Server Action endpoints.
//
// Model: act_practice_test_attempts is created when the student
// starts a form and carries the ordered section plan
// (lib/practice/act-test-plan.ts). Each section runs as its own
// practice_sessions row in the shared runner, with
// filter_criteria = { kind: 'practice_test', attempt_id, section_index,
// section_count, source_test, sectionsOnly: <section>, deadlineAt }.
// When a section's session is submitted (or its deadline passes)
// completeActSection scores it onto the plan and advances the cursor;
// after the last section finalizeActAttempt looks up scaled scores and
// the composite. Attempts started before Phase 3 (plan = []) keep the
// single-session path in finalizeLegacyActSession.

import { ACT_SECTIONS, type ActSection } from '@/lib/practice/act-taxonomy';
import {
  compositeScore,
  isActFormat,
  parsePlan,
  type ActFormat,
  type PlanSection,
} from '@/lib/practice/act-test-plan';

export interface ActAttemptRow {
  id: string;
  user_id: string;
  source_test: string;
  status: string;
  format: string | null;
  time_multiplier: number | null;
  sections: unknown;
  current_section_index: number | null;
  started_at: string;
  finished_at: string | null;
  practice_session_id: string | null;
  english_scaled: number | null;
  math_scaled: number | null;
  reading_scaled: number | null;
  science_scaled: number | null;
  composite_score: number | null;
}

export const ACT_ATTEMPT_COLUMNS =
  'id, user_id, source_test, status, format, time_multiplier, sections, current_section_index, ' +
  'started_at, finished_at, practice_session_id, english_scaled, math_scaled, reading_scaled, ' +
  'science_scaled, composite_score';

export function attemptPath(attemptId: string): string {
  return `/practice/test/act/attempt/${attemptId}`;
}

export function attemptResultsPath(attemptId: string): string {
  return `${attemptPath(attemptId)}/results`;
}

export function attemptFormat(row: { format: string | null }): ActFormat {
  return isActFormat(row.format) ? row.format : 'classic';
}

export type SectionResult =
  | { ok: true; attemptId: string; redirectTo: string; done: boolean }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function loadOwnActAttempt(
  supabase: Db,
  userId: string,
  attemptId: string,
): Promise<ActAttemptRow | null> {
  const { data } = await supabase
    .from('act_practice_test_attempts')
    .select(ACT_ATTEMPT_COLUMNS)
    .eq('id', attemptId)
    .maybeSingle();
  if (!data || (data as ActAttemptRow).user_id !== userId) return null;
  return data as ActAttemptRow;
}

/** Raw score for one section session: one act_attempts row per
 *  question since the session was created (test mode updates it in
 *  place, so first and last are the same row). */
export async function sectionRawScore(
  supabase: Db,
  userId: string,
  questionIds: string[],
  sinceIso: string | null,
): Promise<{ correct: number; total: number }> {
  if (questionIds.length === 0) return { correct: 0, total: 0 };
  const { data } = await supabase
    .from('act_attempts')
    .select('question_id, is_correct, created_at')
    .eq('user_id', userId)
    .in('question_id', questionIds)
    .gte('created_at', sinceIso ?? '1970-01-01T00:00:00Z');
  const byQid = new Map<string, boolean>();
  const rows = ((data ?? []) as Array<{ question_id: string; is_correct: boolean; created_at: string | null }>)
    .slice()
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  for (const r of rows) {
    if (!byQid.has(r.question_id)) byQid.set(r.question_id, Boolean(r.is_correct));
  }
  let correct = 0;
  for (const qid of questionIds) if (byQid.get(qid)) correct += 1;
  return { correct, total: questionIds.length };
}

/** Score the section run by `sessionId` onto the attempt's plan,
 *  advance the cursor, and finalize when it was the last section.
 *  Idempotent: a second call for an already-completed section just
 *  returns the current destination. */
export async function completeActSection(
  supabase: Db,
  userId: string,
  sessionId: string,
): Promise<SectionResult> {
  const { data: session } = await supabase
    .from('practice_sessions')
    .select('id, user_id, question_ids, created_at, test_type, status, filter_criteria')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || session.user_id !== userId) return { ok: false, error: 'Session not found' };
  const fc = (session.filter_criteria ?? {}) as Record<string, unknown>;
  const attemptId = typeof fc.attempt_id === 'string' ? fc.attempt_id : null;
  if (!attemptId) return { ok: false, error: 'Not a multi-section test session' };

  const attempt = await loadOwnActAttempt(supabase, userId, attemptId);
  if (!attempt) return { ok: false, error: 'Attempt not found' };
  if (attempt.status === 'completed') {
    return { ok: true, attemptId, redirectTo: attemptResultsPath(attemptId), done: true };
  }
  if (attempt.status !== 'in_progress') return { ok: false, error: 'This test was abandoned.' };

  const plan = parsePlan(attempt.sections);
  const idx = plan.findIndex((s) => s.session_id === sessionId);
  if (idx < 0) return { ok: false, error: 'Section not found on this attempt' };
  const now = new Date().toISOString();

  if (plan[idx].status !== 'completed') {
    const questionIds: string[] = Array.isArray(session.question_ids)
      ? session.question_ids.filter((q: unknown): q is string => typeof q === 'string')
      : plan[idx].question_ids;
    const raw = await sectionRawScore(supabase, userId, questionIds, session.created_at ?? null);
    plan[idx] = {
      ...plan[idx],
      status: 'completed',
      finished_at: now,
      raw_correct: raw.correct,
      raw_total: raw.total,
    };
    // Close the session if the caller hasn't (timer expiry while
    // the student was away reaches here before any submit).
    if (session.status === 'in_progress') {
      await supabase
        .from('practice_sessions')
        .update({ status: 'completed', last_activity_at: now })
        .eq('id', sessionId)
        .eq('status', 'in_progress');
    }
    // Cursor moves past the finished section; plan.length means
    // "nothing left", which the attempt page reads as finalize.
    const nextIndex = Math.max(attempt.current_section_index ?? 0, idx + 1);
    const { data: updated, error } = await supabase
      .from('act_practice_test_attempts')
      .update({ sections: plan, current_section_index: nextIndex, updated_at: now })
      .eq('id', attemptId)
      .eq('status', 'in_progress')
      .select('id');
    if (error) return { ok: false, error: error.message };
    if (!updated || updated.length === 0) return { ok: false, error: 'Attempt is no longer in progress' };
    attempt.sections = plan;
    attempt.current_section_index = nextIndex;
  }

  if (plan.every((s) => s.status === 'completed')) {
    const fin = await finalizeActAttempt(supabase, attempt, plan);
    if (!fin.ok) return fin;
    return { ok: true, attemptId, redirectTo: attemptResultsPath(attemptId), done: true };
  }
  return { ok: true, attemptId, redirectTo: attemptPath(attemptId), done: false };
}

/** A section whose deadline passed while the student was away: the
 *  runner never got to auto-submit, so close the session here and
 *  score what was answered. */
export async function expireOverdueSection(
  supabase: Db,
  userId: string,
  section: PlanSection,
): Promise<SectionResult> {
  if (!section.session_id) return { ok: false, error: 'Section has no session' };
  await supabase
    .from('practice_sessions')
    .update({ status: 'completed', last_activity_at: new Date().toISOString() })
    .eq('id', section.session_id)
    .eq('status', 'in_progress');
  return completeActSection(supabase, userId, section.session_id);
}

/** Scaled lookups for every scored section, composite per the
 *  format rule, status → completed. */
export async function finalizeActAttempt(
  supabase: Db,
  attempt: ActAttemptRow,
  plan: PlanSection[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const format = attemptFormat(attempt);
  const raw: Partial<Record<ActSection, { correct: number; total: number }>> = {};
  for (const s of plan) {
    if (s.raw_total == null || s.raw_total <= 0) continue;
    const acc = raw[s.section] ?? { correct: 0, total: 0 };
    acc.correct += s.raw_correct ?? 0;
    acc.total += s.raw_total;
    raw[s.section] = acc;
  }

  const scaled: Partial<Record<ActSection, number | null>> = {};
  await Promise.all(
    ACT_SECTIONS.filter((sec) => (raw[sec]?.total ?? 0) > 0).map(async (sec) => {
      const { data } = await supabase
        .from('act_score_conversion')
        .select('scaled_score')
        .eq('source_test', attempt.source_test)
        .eq('section', sec)
        .eq('raw_score', raw[sec]!.correct)
        .maybeSingle();
      scaled[sec] = data?.scaled_score != null ? Number(data.scaled_score) : null;
    }),
  );

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('act_practice_test_attempts')
    .update({
      status: 'completed',
      finished_at: now,
      sections: plan,
      current_section_index: plan.length,
      english_scaled: scaled.english ?? null,
      math_scaled: scaled.math ?? null,
      reading_scaled: scaled.reading ?? null,
      science_scaled: scaled.science ?? null,
      composite_score: compositeScore(format, scaled),
      updated_at: now,
    })
    .eq('id', attempt.id)
    .eq('status', 'in_progress')
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) return { ok: false, error: 'Attempt is no longer in progress' };

  await markActTestAssignmentsCompleted(supabase, attempt.user_id, attempt.source_test);
  return { ok: true };
}

/**
 * ACT practice-test assignments (Phase 4B): finishing any attempt of
 * the assigned form completes every open assignment of that form for
 * the student — the same contract as SAT's
 * markPracticeTestAssignmentsCompletedIfDone. Best-effort: a
 * bookkeeping failure never fails the finalize that triggered it.
 */
async function markActTestAssignmentsCompleted(
  supabase: Db,
  userId: string,
  sourceTest: string,
): Promise<void> {
  try {
    const { data: matching } = await supabase
      .from('assignments_v2')
      .select('id')
      .eq('assignment_type', 'practice_test')
      .eq('test_type', 'act')
      .eq('act_source_test', sourceTest)
      .is('deleted_at', null);
    const ids = ((matching ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (ids.length === 0) return;
    await supabase
      .from('assignment_students_v2')
      .update({ completed_at: new Date().toISOString() })
      .eq('student_id', userId)
      .in('assignment_id', ids)
      .is('completed_at', null);
  } catch {
    // Swallow — the attempt is finalized either way.
  }
}

/**
 * Legacy path: ACT practice tests started before Phase 3 were one
 * practice_sessions row holding the whole form, and the attempt row
 * was written here at submit. Kept so an in-flight session of that
 * shape still lands on its results page after this deploys.
 */
export async function finalizeLegacyActSession(
  supabase: Db,
  userId: string,
  sessionId: string,
): Promise<{ ok: true; attemptId: string } | { ok: false; error: string }> {
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

  const questionIds: string[] = Array.isArray(session.question_ids) ? session.question_ids : [];
  const { data: meta } = questionIds.length > 0
    ? await supabase.from('act_questions').select('id, section').in('id', questionIds)
    : { data: [] };
  const sectionByQid = new Map<string, string>();
  for (const r of (meta ?? []) as Array<{ id: string; section: string }>) sectionByQid.set(r.id, r.section);

  const bySection: Partial<Record<ActSection, string[]>> = {};
  for (const qid of questionIds) {
    const sec = sectionByQid.get(qid);
    if (!sec || !(ACT_SECTIONS as readonly string[]).includes(sec)) continue;
    (bySection[sec as ActSection] ??= []).push(qid);
  }

  const scaled: Partial<Record<ActSection, number | null>> = {};
  await Promise.all(
    ACT_SECTIONS.filter((sec) => (bySection[sec]?.length ?? 0) > 0).map(async (sec) => {
      const raw = await sectionRawScore(supabase, userId, bySection[sec]!, session.created_at ?? null);
      const { data } = await supabase
        .from('act_score_conversion')
        .select('scaled_score')
        .eq('source_test', sourceTest)
        .eq('section', sec)
        .eq('raw_score', raw.correct)
        .maybeSingle();
      scaled[sec] = data?.scaled_score != null ? Number(data.scaled_score) : null;
    }),
  );

  // Legacy attempts predate act_forms; composite only when all four
  // sections scored, as before.
  const composite = compositeScore('classic', scaled);
  const now = new Date().toISOString();
  const patch = {
    status: 'completed',
    finished_at: now,
    english_scaled: scaled.english ?? null,
    math_scaled: scaled.math ?? null,
    reading_scaled: scaled.reading ?? null,
    science_scaled: scaled.science ?? null,
    composite_score: composite,
    updated_at: now,
  };

  const { data: existing } = await supabase
    .from('act_practice_test_attempts')
    .select('id')
    .eq('practice_session_id', sessionId)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase.from('act_practice_test_attempts').update(patch).eq('id', existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, attemptId: existing.id as string };
  }
  const { data: inserted, error } = await supabase
    .from('act_practice_test_attempts')
    .insert({
      user_id: userId,
      source_test: sourceTest,
      started_at: session.created_at ?? now,
      practice_session_id: sessionId,
      ...patch,
    })
    .select('id')
    .single();
  if (error || !inserted) return { ok: false, error: error?.message ?? 'insert failed' };
  return { ok: true, attemptId: (inserted as { id: string }).id };
}
