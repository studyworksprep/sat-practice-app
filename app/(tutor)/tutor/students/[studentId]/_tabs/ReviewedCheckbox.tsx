// "Reviewed" checkbox on an assignment row of the tutor's student page.
// Ticking it records that the tutor went over the work with the
// student; the server action revalidates the page, so the row moves
// out of the review queue (Overview) or down into Reviewed (Assignments
// tab) once the database has it. The tick shows immediately and falls
// back to the saved state if the write fails.

'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { setAssignmentReviewed } from '../review-actions';
import s from '../StudentDetail.module.css';

interface ReviewedCheckboxProps {
  assignmentId: string;
  studentId: string;
  reviewed: boolean;
  /** Tooltip: who reviewed it and when, or what ticking it means. */
  title: string;
}

export function ReviewedCheckbox({ assignmentId, studentId, reviewed, title }: ReviewedCheckboxProps) {
  const [checked, setChecked] = useOptimistic(reviewed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      setChecked(next);
      const res = await setAssignmentReviewed({ assignmentId, studentId, reviewed: next });
      if (!res.ok) setError(res.error || 'Could not save. Try again.');
    });
  }

  const cls = [s.reviewedToggle, checked ? s.reviewedToggleOn : null, pending ? s.reviewedTogglePending : null]
    .filter(Boolean).join(' ');

  return (
    <div className={s.reviewedCell}>
      <label className={cls} title={title}>
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>Reviewed</span>
      </label>
      {error && <span className={s.reviewedError} role="alert">{error}</span>}
    </div>
  );
}
