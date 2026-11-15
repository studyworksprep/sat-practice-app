// Groups one student's assignments for the tutor's review workflow on
// /tutor/students/[id] (migration 20261115152919, set_assignment_reviewed).
//
// A tutor marks each assignment "reviewed" once they have gone over it
// with the student. Until then it stays in front of them:
//
//   toReview  finished, not yet reviewed: the homework to go over next.
//             Most recently finished first.
//   open      not finished, not reviewed. Order kept from the caller
//             (the loader sorts newest-assigned first).
//   reviewed  reviewed, finished or not. Newest work first.
//
// Pure and import-free so node --test can load it directly.

export interface ReviewableAssignment {
  created_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
}

export interface ReviewSplit<T> {
  toReview: T[];
  open: T[];
  reviewed: T[];
}

function time(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function splitForReview<T extends ReviewableAssignment>(rows: readonly T[]): ReviewSplit<T> {
  const toReview: T[] = [];
  const open: T[] = [];
  const reviewed: T[] = [];
  for (const row of rows) {
    if (row.reviewed_at) reviewed.push(row);
    else if (row.completed_at) toReview.push(row);
    else open.push(row);
  }
  toReview.sort((a, b) => time(b.completed_at) - time(a.completed_at));
  reviewed.sort((a, b) => time(b.completed_at ?? b.created_at) - time(a.completed_at ?? a.created_at));
  return { toReview, open, reviewed };
}

// ── Practice tests: which assignment did an attempt complete? ───────
// Practice-test attempts carry no assignment link: finishing any
// attempt of the assigned test completes the assignment
// (app/(student)/practice/test/actions.js, lib/practice-test/act-attempt.ts).
// resolveDashboardReport (lib/tutor/dashboard-report.ts) takes an
// assignment's report to be the student's latest completed attempt of
// the test that finished by the time the assignment was completed.
// This is the inverse: an attempt belongs to a completed assignment of
// the same test when it finished by then and no later attempt also did.

export interface PracticeTestAssignmentRow {
  assignment_id: string;
  completed_at: string | null;
  assignment: {
    assignment_type: string;
    test_type: string | null;
    practice_test_id: string | null;
    act_source_test: string | null;
    deleted_at: string | null;
    archived_at: string | null;
    created_at: string | null;
  } | null;
}

export interface PracticeTestAttemptMatch {
  testType: 'sat' | 'act';
  /** practice_test_id (SAT) or source_test (ACT). */
  testId: string;
  finishedAt: string;
  /** finished_at of every completed attempt of the same test by the
   *  same student (this one included or not; it is ignored). */
  otherFinishedAt: readonly (string | null)[];
}

/** The live practice-test assignment row this attempt completed, or
 *  null. If one attempt completed the same test assigned twice, the
 *  most recently assigned copy wins. */
export function pickPracticeTestAssignment<T extends PracticeTestAssignmentRow>(
  rows: readonly T[],
  attempt: PracticeTestAttemptMatch,
): T | null {
  const finished = time(attempt.finishedAt);
  if (!finished) return null;
  const others = attempt.otherFinishedAt.map(time).filter((t) => t > finished);
  const matches = rows.filter((r) => {
    const a = r.assignment;
    if (!a || a.deleted_at || a.archived_at || a.assignment_type !== 'practice_test') return false;
    if ((a.test_type ?? 'sat') !== attempt.testType) return false;
    if ((attempt.testType === 'act' ? a.act_source_test : a.practice_test_id) !== attempt.testId) return false;
    const done = time(r.completed_at);
    if (!done || finished > done) return false;
    // A later attempt that also finished in time is that assignment's report instead.
    return !others.some((t) => t <= done);
  });
  matches.sort((x, y) => time(y.assignment?.created_at ?? null) - time(x.assignment?.created_at ?? null));
  return matches[0] ?? null;
}
