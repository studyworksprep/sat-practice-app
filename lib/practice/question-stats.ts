// Per-question statistics — shared types + role gate for the staff
// "Stats" modal (QuestionStatsButton) and its Server Action
// (question-stats-actions.ts).
//
// The payload is produced by the SECURITY DEFINER RPC
// public.get_question_stats(question_id) (migration 20260819120000).
// Two cuts come back in one call:
//   all    — every student's attempts, bank-wide
//   roster — restricted to list_visible_users(), i.e. the students the
//            caller could already see row-by-row under RLS. Null for
//            admins (identical to `all`).
//
// Everything here is an aggregate count — no student ids, no rows.

import type { UserRole } from '@/lib/types';

/** Who may open the stats modal — every staff role, matching the DB
 *  function's own gate (is_teacher() = teacher | manager | admin, the
 *  item_stats precedent). Teachers see aggregate bank-wide counts here
 *  that their row-level attempts visibility (roster-only) doesn't
 *  grant — a deliberate product call: aggregates only, no student ids,
 *  same exposure item_stats already gives them. */
export const QUESTION_STATS_ROLES: readonly UserRole[] =
  ['teacher', 'manager', 'admin'];

export interface QuestionStatsCut {
  n_students: number;
  n_attempts: number;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  /** First attempt per student. `no_response` rows are counted as
   *  incorrect in `correct` (test-scoring semantics). */
  first: { n: number; correct: number; no_response: number };
  /** Every attempt row, retries included. */
  all: { n: number; correct: number };
  /** First-attempt responses with a recorded value, top 12 by count.
   *  MCQ → letters; SPR → typed values. `correct` is how many of those
   *  responses were graded correct (normally all-or-nothing per value;
   *  a split means the key changed under existing attempts). */
  distribution: Array<{ response: string; count: number; correct: number }>;
  /** First attempts with 0 < time <= 30 min. */
  timing: {
    n_timed: number;
    median_ms: number | null;
    p25_ms: number | null;
    p75_ms: number | null;
    median_correct_ms: number | null;
    median_wrong_ms: number | null;
  };
  by_context: Array<{ context: string; n: number; correct: number }>;
  retry: { students_retried: number; wrong_first: number; recovered: number };
  marked_for_review: { flagged: number; items: number };
}

export interface QuestionStatsBaseline {
  n: number;
  correct: number;
  n_questions: number;
}

export interface QuestionStatsPlacement {
  test_name: string;
  test_code: string;
  subject_code: string;
  module_number: number;
  route_code: string;
  ordinal: number;
  is_published: boolean;
}

export interface QuestionStats {
  question_id: string;
  question_type: string;
  key_label: string | null;
  difficulty: number | null;
  score_band: number | null;
  skill_code: string | null;
  skill_name: string | null;
  all: QuestionStatsCut;
  /** Null when the viewer is an admin (roster == all). */
  roster: QuestionStatsCut | null;
  /** Point-biserial r between first-attempt correctness on this item and
   *  each student's first-attempt accuracy on their other items. `n` is
   *  the number of students with >= 10 other items. Null r when
   *  undefined. */
  discrimination: { r: number | null; n: number };
  /** Other questions sharing skill_code (first attempts, all students). */
  skill_baseline: QuestionStatsBaseline | null;
  /** Same, narrowed to the same labelled difficulty. */
  skill_difficulty_baseline: QuestionStatsBaseline | null;
  placements: QuestionStatsPlacement[];
  signals: {
    assignments: number;
    error_notes: number;
    student_notes: number;
    question_notes: number;
    desmos_states: number;
  };
  computed_at: string;
}

/** Light structural check on the RPC's jsonb before we trust it. */
export function parseQuestionStats(raw: unknown): QuestionStats | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.question_id !== 'string') return null;
  if (!o.all || typeof o.all !== 'object') return null;
  return raw as QuestionStats;
}
