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

import { sectionLabel, type ActSection } from '@/lib/practice/act-taxonomy';
import { buildActSectionRows, type ActReportCategory } from './act-report.ts';
import { isUntimedPlan, parsePlan, type ActFormat } from '@/lib/practice/act-test-plan';
import { actFormDetail, actFormName } from '@/lib/practice/act-form-names';
import {
  ACT_ATTEMPT_COLUMNS,
  attemptFormat,
  type ActAttemptRow,
} from './act-attempt';

export interface ActTestResultsAttempt {
  id: string;
  userId: string;
  sourceTest: string;
  /** Student-facing name (act_forms.display_name or the derived default). */
  formName: string;
  /** "Form E25"-style detail, or null. */
  formDetail: string | null;
  status: string;
  format: ActFormat;
  timeMultiplier: number;
  untimed: boolean;
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
  attempted: number;
  timeMs: number;
  categories: ActReportCategory[];
  /** The practice_sessions row that ran this section (review link). */
  sessionId: string | null;
}

export type ActTestResultsLoad =
  | { ok: false; code: 'not-found' }
  | { ok: false; code: 'in-progress'; attempt: ActTestResultsAttempt }
  | { ok: true; attempt: ActTestResultsAttempt; sectionRows: ActSectionRow[] };

function toAttempt(row: ActAttemptRow, displayName: string | null | undefined): ActTestResultsAttempt {
  return {
    id: row.id,
    userId: row.user_id,
    sourceTest: row.source_test,
    formName: actFormName(row.source_test, displayName),
    formDetail: actFormDetail(row.source_test),
    status: row.status,
    format: attemptFormat(row),
    timeMultiplier: Number(row.time_multiplier ?? 1) || 1,
    untimed: isUntimedPlan(row.sections),
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
  const { data: formRow } = await supabase
    .from('act_forms')
    .select('display_name')
    .eq('source_test', row.source_test)
    .maybeSingle();
  const attempt = toAttempt(row, (formRow as { display_name?: string | null } | null)?.display_name);
  if (row.status !== 'completed') return { ok: false, code: 'in-progress', attempt };

  const plan = parsePlan(row.sections);
  const sessionIds = plan.length
    ? plan.flatMap((section) => section.session_id ? [section.session_id] : [])
    : row.practice_session_id ? [row.practice_session_id] : [];
  const { data: sessions, error: sessionsError } = sessionIds.length
    ? await supabase.from('practice_sessions')
        .select('id, question_ids, created_at').in('id', sessionIds)
    : { data: [], error: null };
  if (sessionsError) throw new Error('Unable to load ACT report sessions.');
  const sessionById = new Map<string, { question_ids: string[]; created_at: string }>(
    (sessions ?? []).map((session: { id: string; question_ids: string[]; created_at: string }) => [session.id, session]),
  );
  const entries = plan.length ? plan : [{
    section: null,
    session_id: row.practice_session_id,
    question_ids: sessionById.get(row.practice_session_id ?? '')?.question_ids ?? [],
    finished_at: row.finished_at,
    raw_correct: null,
    raw_total: null,
  }];
  const sectionRows: ActSectionRow[] = [];
  for (const entry of entries) {
    const session = sessionById.get(entry.session_id ?? '');
    const questionIds = entry.question_ids;
    const [{ data: questions, error: questionError }, { data: answers, error: answerError }] = await Promise.all([
      questionIds.length
        ? supabase.from('act_questions').select('id, section, category, subcategory').in('id', questionIds)
        : Promise.resolve({ data: [], error: null }),
      questionIds.length && session
        ? supabase.from('act_attempts').select('question_id, is_correct, created_at, time_spent_ms')
            .eq('user_id', row.user_id).in('question_id', questionIds)
            .gte('created_at', session.created_at)
            .lte('created_at', entry.finished_at ?? row.finished_at)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (questionError || answerError) throw new Error('Unable to load ACT report answers.');
    const rows = buildActSectionRows(
      questionIds, questions ?? [], answers ?? [], row as unknown as Record<string, unknown>,
      entry.finished_at ?? row.finished_at,
    );
    if (entry.section && !rows.some((section) => section.section === entry.section)) {
      rows.push({
        section: entry.section, label: sectionLabel(entry.section),
        raw: { correct: 0, total: questionIds.length }, attempted: 0, timeMs: 0,
        scaled: row[`${entry.section}_scaled`], categories: [],
      });
    }
    for (const section of rows) {
      sectionRows.push({
        ...section,
        raw: entry.raw_total != null
          ? { correct: entry.raw_correct ?? 0, total: entry.raw_total }
          : section.raw,
        sessionId: entry.session_id,
      });
    }
  }
  return { ok: true, attempt, sectionRows };
}
