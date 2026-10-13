// Loader for the ACT practice-test results view. Shared by the
// student route (app/(student)/practice/test/act/attempt/[attemptId]/
// results) and the tutor route (app/(tutor)/tutor/students/
// [studentId]/tests/[attemptId]/results, which falls through to this
// loader when the id isn't a SAT attempt).
//
// Phase 3 attempts carry their section plan (one practice_sessions
// row per section, raw score stored on the plan at section
// completion) and the format that decides the composite rule. Scaled
// scores and the composite are the cached values finalizeActAttempt
// wrote. Pre-Phase-3 attempts (empty plan, practice_session_id set)
// recompute raw correct / total from that single session's questions
// + the student's act_attempts in the session window.
//
// Access is RLS: act_practice_test_attempts.select uses
// can_view(user_id), act_attempts has the visibility policy, and
// practice_sessions is readable by the student's tutors. Callers add
// their own ownership check where the viewer must be the owner.

import { ACT_SECTIONS, sectionLabel, type ActSection } from '@/lib/practice/act-taxonomy';
import { parsePlan, type ActFormat } from '@/lib/practice/act-test-plan';
import {
  ACT_ATTEMPT_COLUMNS,
  attemptFormat,
  sectionRawScore,
  type ActAttemptRow,
} from './act-attempt';

export interface ActTestResultsAttempt {
  id: string;
  userId: string;
  sourceTest: string;
  status: string;
  format: ActFormat;
  timeMultiplier: number;
  startedAt: string | null;
  finishedAt: string | null;
  compositeScore: number | null;
  /** Legacy single-session attempts only. */
  practiceSessionId: string | null;
}

export interface ActSectionRow {
  section: ActSection;
  label: string;
  raw: { total: number; correct: number };
  scaled: number | null;
  /** The practice_sessions row that ran this section (review link). */
  sessionId: string | null;
}

export type ActTestResultsLoad =
  | { ok: false; code: 'not-found' }
  | { ok: false; code: 'in-progress'; attempt: ActTestResultsAttempt }
  | { ok: true; attempt: ActTestResultsAttempt; sectionRows: ActSectionRow[] };

function toAttempt(row: ActAttemptRow): ActTestResultsAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    sourceTest: row.source_test,
    status: row.status,
    format: attemptFormat(row),
    timeMultiplier: Number(row.time_multiplier ?? 1) || 1,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    compositeScore: row.composite_score,
    practiceSessionId: row.practice_session_id,
  };
}

export async function loadActTestResults({
  supabase,
  attemptId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  attemptId: string;
}): Promise<ActTestResultsLoad> {
  const { data } = await supabase
    .from('act_practice_test_attempts')
    .select(ACT_ATTEMPT_COLUMNS)
    .eq('id', attemptId)
    .maybeSingle();
  if (!data) return { ok: false, code: 'not-found' };
  const row = data as ActAttemptRow;
  const attempt = toAttempt(row);
  if (row.status !== 'completed') return { ok: false, code: 'in-progress', attempt };

  const scaledFor = (sec: ActSection): number | null => {
    const v = (row as unknown as Record<string, unknown>)[`${sec}_scaled`];
    return typeof v === 'number' ? v : null;
  };

  const plan = parsePlan(row.sections);
  if (plan.length > 0) {
    // Raw scores were stored at section completion; recompute only
    // for a plan entry that somehow lacks them.
    const missing = plan.filter((p) => p.raw_total == null && p.session_id);
    const createdAt = new Map<string, string | null>();
    if (missing.length > 0) {
      const { data: sessions } = await supabase
        .from('practice_sessions')
        .select('id, created_at')
        .in('id', missing.map((p) => p.session_id));
      for (const s of (sessions ?? []) as Array<{ id: string; created_at: string | null }>) {
        createdAt.set(s.id, s.created_at);
      }
    }
    const sectionRows: ActSectionRow[] = [];
    for (const p of plan) {
      let raw = { correct: p.raw_correct ?? 0, total: p.raw_total ?? 0 };
      if (p.raw_total == null && p.session_id) {
        raw = await sectionRawScore(
          supabase,
          row.user_id,
          p.question_ids,
          createdAt.get(p.session_id) ?? null,
        );
      }
      sectionRows.push({
        section: p.section,
        label: sectionLabel(p.section),
        raw,
        scaled: scaledFor(p.section),
        sessionId: p.session_id,
      });
    }
    return { ok: true, attempt, sectionRows };
  }

  // Legacy single-session attempt.
  let questionIds: string[] = [];
  let sessionCreatedAt: string | null = null;
  if (row.practice_session_id) {
    const { data: session } = await supabase
      .from('practice_sessions')
      .select('id, question_ids, created_at')
      .eq('id', row.practice_session_id)
      .maybeSingle();
    if (session) {
      questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
      sessionCreatedAt = session.created_at ?? null;
    }
  }
  const { data: meta } = questionIds.length > 0
    ? await supabase.from('act_questions').select('id, section').in('id', questionIds)
    : { data: [] };
  const bySection: Partial<Record<ActSection, string[]>> = {};
  const isSection = (v: string): v is ActSection => (ACT_SECTIONS as readonly string[]).includes(v);
  const sectionByQid = new Map<string, string>();
  for (const r of (meta ?? []) as Array<{ id: string; section: string }>) sectionByQid.set(r.id, r.section);
  for (const qid of questionIds) {
    const sec = sectionByQid.get(qid);
    if (!sec || !isSection(sec)) continue;
    (bySection[sec] ??= []).push(qid);
  }
  const sectionRows: ActSectionRow[] = [];
  for (const sec of ACT_SECTIONS) {
    const ids = bySection[sec];
    if (!ids || ids.length === 0) continue;
    const raw = await sectionRawScore(supabase, row.user_id, ids, sessionCreatedAt);
    sectionRows.push({
      section: sec,
      label: sectionLabel(sec),
      raw,
      scaled: scaledFor(sec),
      sessionId: row.practice_session_id,
    });
  }
  return { ok: true, attempt, sectionRows };
}
