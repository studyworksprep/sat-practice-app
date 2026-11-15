// What the Reviewed checkbox shows for one student's copy of an
// assignment (migration 20261115152919): checked or not, the
// "Reviewed Nov 15 · by you" line, and the tooltip. Shared by the
// tutor's student page and the homework report headers.

import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/formatters';

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

  let reviewedByName: string | null = null;
  if (data.reviewed_by && data.reviewed_by !== viewerId) {
    const { data: card } = await supabase
      .from('profile_cards')
      .select('first_name, last_name, tutor_name')
      .eq('id', data.reviewed_by)
      .maybeSingle();
    if (card) {
      reviewedByName = (card.tutor_name ?? '').trim()
        || [card.first_name, card.last_name].filter(Boolean).join(' ').trim()
        || null;
    }
  }
  return reviewStateOf(
    { reviewedAt: data.reviewed_at, reviewedBy: data.reviewed_by, reviewedByName },
    viewerId,
  );
}
