// What the Reviewed checkbox shows for one student's copy of an
// assignment (migration 20261115152919): checked or not, the
// "Reviewed Nov 15 · by you" line, and the tooltip. Shared by the
// tutor's student page, the homework report headers and the practice
// test results page.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/formatters';
import { pickPracticeTestAssignment, type PracticeTestAssignmentRow } from './assignment-review';

export interface ReviewStamp {
  reviewedAt: string | null;
  reviewedBy: string | null;
  /** Reviewer's display name, when the viewer can see their profile. */
  reviewedByName: string | null;
}

export interface ReviewState {
  reviewed: boolean;
  /** "Reviewed Nov 15 · by you"; null when unreviewed, and on rows the
   *  2026-11-15 backfill marked (no reviewer, so the date would only
   *  be the rollout). */
  label: string | null;
  /** Tooltip for the checkbox. */
  title: string;
}

const REVIEW_HINT = 'Tick once you have gone over this with the student';

export function reviewStateOf(stamp: ReviewStamp, viewerId: string): ReviewState {
  let label: string | null = null;
  if (stamp.reviewedAt && stamp.reviewedBy) {
    const who = stamp.reviewedBy === viewerId ? 'you' : stamp.reviewedByName;
    label = `Reviewed ${formatDate(stamp.reviewedAt)}${who ? ` · by ${who}` : ''}`;
  }
  return {
    reviewed: Boolean(stamp.reviewedAt),
    label,
    title: label ?? (stamp.reviewedAt ? 'Reviewed' : REVIEW_HINT),
  };
}

/** Display name of whoever marked a row reviewed, when the viewer can
 *  see their profile card. Not looked up for the viewer themselves
 *  ("by you"). */
async function reviewerName(
  supabase: TypedSupabaseClient,
  reviewedBy: string | null,
  viewerId: string,
): Promise<string | null> {
  if (!reviewedBy || reviewedBy === viewerId) return null;
  const { data: card } = await supabase
    .from('profile_cards')
    .select('first_name, last_name, tutor_name')
    .eq('id', reviewedBy)
    .maybeSingle();
  if (!card) return null;
  return (card.tutor_name ?? '').trim()
    || [card.first_name, card.last_name].filter(Boolean).join(' ').trim()
    || null;
}

/** One student's review state on one assignment, read through the
 *  caller's RLS-scoped client. Null when the student is not on the
 *  assignment (or the caller cannot see the row). */
export async function loadReviewState(
  supabase: TypedSupabaseClient,
  assignmentId: string,
  studentId: string,
  viewerId: string,
): Promise<ReviewState | null> {
  const { data } = await supabase
    .from('assignment_students_v2')
    .select('reviewed_at, reviewed_by')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (!data) return null;
  const reviewedByName = await reviewerName(supabase, data.reviewed_by, viewerId);
  return reviewStateOf(
    { reviewedAt: data.reviewed_at, reviewedBy: data.reviewed_by, reviewedByName },
    viewerId,
  );
}

export interface PracticeTestAttemptRef {
  /** The attempt's owner. */
  studentId: string;
  testType: 'sat' | 'act';
  /** practice_test_id (SAT) or source_test (ACT). */
  testId: string | null;
  finishedAt: string | null;
}

/** The practice-test assignment a completed attempt fulfilled, with its
 *  review state, or null when the attempt answers no assignment. The
 *  matching rule is pickPracticeTestAssignment (./assignment-review.ts).
 *  Students only: trainees' training work is not homework. */
export async function loadPracticeTestReview(
  supabase: TypedSupabaseClient,
  attempt: PracticeTestAttemptRef,
  viewerId: string,
): Promise<{ assignmentId: string; state: ReviewState } | null> {
  const { studentId, testType, testId, finishedAt } = attempt;
  if (!testId || !finishedAt) return null;

  const [{ data: owner }, { data: rows }, { data: attempts }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', studentId).maybeSingle(),
    supabase
      .from('assignment_students_v2')
      .select(`
        assignment_id, completed_at, reviewed_at, reviewed_by,
        assignment:assignments_v2 (
          assignment_type, test_type, practice_test_id, act_source_test,
          deleted_at, archived_at, created_at
        )
      `)
      .eq('student_id', studentId)
      .not('completed_at', 'is', null),
    testType === 'act'
      ? supabase.from('act_practice_test_attempts').select('finished_at')
          .eq('user_id', studentId).eq('source_test', testId).eq('status', 'completed')
      : supabase.from('practice_test_attempts_v2').select('finished_at')
          .eq('user_id', studentId).eq('practice_test_id', testId).eq('status', 'completed'),
  ]);
  if (['teacher', 'manager', 'admin'].includes(owner?.role ?? '')) return null;

  const row = pickPracticeTestAssignment(
    (rows ?? []) as unknown as Array<PracticeTestAssignmentRow & { reviewed_at: string | null; reviewed_by: string | null }>,
    { testType, testId, finishedAt, otherFinishedAt: (attempts ?? []).map((a) => a.finished_at) },
  );
  if (!row) return null;
  const reviewedByName = await reviewerName(supabase, row.reviewed_by, viewerId);
  return {
    assignmentId: row.assignment_id,
    state: reviewStateOf(
      { reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by, reviewedByName },
      viewerId,
    ),
  };
}
