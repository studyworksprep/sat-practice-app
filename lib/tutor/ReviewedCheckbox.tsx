// "Reviewed" checkbox for one student's copy of an assignment
// (migration 20261115152919). Ticking it records that the tutor went
// over the work with the student. Used on the tutor's student page
// (one per assignment row) and in the header of the homework reports
// (/tutor/sessions/[id], /tutor/assignments/[id]/students/[studentId]).
//
// The tick shows immediately; once the save lands, router.refresh()
// re-reads the page so the server's state takes over (on the student
// page that moves the row between sections). A failed save falls back
// to the saved state with an inline error.

'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setAssignmentReviewed } from './review-actions';
import s from './ReviewedCheckbox.module.css';

interface ReviewedCheckboxProps {
  assignmentId: string;
  studentId: string;
  reviewed: boolean;
  /** Tooltip: who reviewed it and when, or what ticking it means. */
  title: string;
  /** Label while checked, e.g. "Reviewed Nov 15 · by you"; plain
   *  "Reviewed" when omitted. Used where there is no other line for it
   *  (the report headers). */
  checkedLabel?: string | null;
}

export function ReviewedCheckbox({ assignmentId, studentId, reviewed, title, checkedLabel = null }: ReviewedCheckboxProps) {
  const router = useRouter();
  const [checked, setChecked] = useOptimistic(reviewed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(next: boolean) {
    setError(null);
    startTransition(async () => {
      setChecked(next);
      const res = await setAssignmentReviewed({ assignmentId, studentId, reviewed: next });
      if (!res.ok) {
        setError(res.error || 'Could not save. Try again.');
        return;
      }
      router.refresh();
    });
  }

  const cls = [s.toggle, checked ? s.toggleOn : null, pending ? s.togglePending : null]
    .filter(Boolean).join(' ');

  return (
    <div className={s.cell}>
      <label className={cls} title={title}>
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span>{checked && checkedLabel ? checkedLabel : 'Reviewed'}</span>
      </label>
      {error && <span className={s.error} role="alert">{error}</span>}
    </div>
  );
}
