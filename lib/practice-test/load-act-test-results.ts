// Loader for the ACT practice-test results view. Shared by the
// student route (app/(student)/practice/test/act/attempt/[attemptId]/
// results) and the tutor route (app/(tutor)/tutor/students/
// [studentId]/tests/[attemptId]/results, which falls through to this
// loader when the id isn't a SAT attempt).
//
// Reads the cached scaled scores from act_practice_test_attempts
// (written by finalizeActPracticeTest) and recomputes raw correct /
// total per section from the linked practice_session's question_ids
// + the student's act_attempts in the session window, so raw counts
// render even for forms with no conversion table yet.
//
// Access is RLS: act_practice_test_attempts.select uses
// can_view(user_id), act_attempts has the teacher-read policy, and
// practice_sessions is readable by the student's tutors. Callers add
// their own ownership check where the viewer must be the owner.

import { sectionLabel } from '@/lib/practice/act-taxonomy';

const SECTIONS = ['english', 'math', 'reading', 'science'] as const;
type Section = (typeof SECTIONS)[number];

export interface ActTestResultsAttempt {
  id: string;
  userId: string;
  sourceTest: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  compositeScore: number | null;
  practiceSessionId: string | null;
}

export interface ActSectionRow {
  section: Section;
  label: string;
  raw: { total: number; correct: number };
  scaled: number | null;
}

export type ActTestResultsLoad =
  | { ok: false; code: 'not-found' }
  | { ok: true; attempt: ActTestResultsAttempt; sectionRows: ActSectionRow[] };

type AttemptRow = {
  question_id: string;
  is_correct: boolean;
  created_at: string | null;
};

export async function loadActTestResults({
  supabase,
  attemptId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  attemptId: string;
}): Promise<ActTestResultsLoad> {
  const { data: attempt } = await supabase
    .from('act_practice_test_attempts')
    .select(
      'id, user_id, source_test, status, started_at, finished_at, ' +
      'english_scaled, math_scaled, reading_scaled, science_scaled, ' +
      'composite_score, practice_session_id',
    )
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt) return { ok: false, code: 'not-found' };

  let questionIds: string[] = [];
  let sessionCreatedAt: string | null = null;
  if (attempt.practice_session_id) {
    const { data: session } = await supabase
      .from('practice_sessions')
      .select('id, question_ids, created_at')
      .eq('id', attempt.practice_session_id)
      .maybeSingle();
    if (session) {
      questionIds = Array.isArray(session.question_ids) ? session.question_ids : [];
      sessionCreatedAt = session.created_at ?? null;
    }
  }

  const [{ data: meta }, { data: attempts }] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from('act_questions')
          .select('id, section')
          .in('id', questionIds)
      : Promise.resolve({ data: [] }),
    questionIds.length > 0
      ? supabase
          .from('act_attempts')
          .select('question_id, is_correct, created_at')
          .eq('user_id', attempt.user_id)
          .in('question_id', questionIds)
          .gte('created_at', sessionCreatedAt ?? '1970-01-01T00:00:00Z')
      : Promise.resolve({ data: [] }),
  ]);

  const sectionByQid = new Map<string, string>();
  for (const r of (meta ?? []) as Array<{ id: string; section: string }>) {
    sectionByQid.set(r.id, r.section);
  }

  // One act_attempts row per question in the session window: test
  // mode updates it in place when the student changes an answer, so
  // first and last are the same row. Earliest-first keeps the
  // historical tie-break for any pre-test-mode sessions.
  const byQid = new Map<string, AttemptRow>();
  for (const a of ((attempts ?? []) as AttemptRow[]).slice().sort((x, y) =>
    (x.created_at ?? '').localeCompare(y.created_at ?? ''),
  )) {
    if (!byQid.has(a.question_id)) byQid.set(a.question_id, a);
  }

  const sectionStats: Record<Section, { total: number; correct: number }> = {
    english: { total: 0, correct: 0 },
    math: { total: 0, correct: 0 },
    reading: { total: 0, correct: 0 },
    science: { total: 0, correct: 0 },
  };
  const isSection = (v: string): v is Section => (SECTIONS as readonly string[]).includes(v);
  for (const qid of questionIds) {
    const sec = sectionByQid.get(qid);
    if (!sec || !isSection(sec)) continue;
    sectionStats[sec].total += 1;
    if (byQid.get(qid)?.is_correct) sectionStats[sec].correct += 1;
  }

  const scaledFor = (sec: Section): number | null => {
    const v = (attempt as Record<string, unknown>)[`${sec}_scaled`];
    return typeof v === 'number' ? v : null;
  };
  const sectionRows: ActSectionRow[] = SECTIONS
    .filter((sec) => sectionStats[sec].total > 0)
    .map((sec) => ({
      section: sec,
      label: sectionLabel(sec),
      raw: sectionStats[sec],
      scaled: scaledFor(sec),
    }));

  return {
    ok: true,
    attempt: {
      id: attempt.id,
      userId: attempt.user_id,
      sourceTest: attempt.source_test,
      status: attempt.status,
      startedAt: attempt.started_at,
      finishedAt: attempt.finished_at,
      compositeScore: attempt.composite_score,
      practiceSessionId: attempt.practice_session_id,
    },
    sectionRows,
  };
}
