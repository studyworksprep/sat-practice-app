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
