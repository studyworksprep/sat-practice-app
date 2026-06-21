// Quick-edit modal for the two profile fields a tutor reaches for
// most often on the student detail page: target SAT score + start
// date. Reuses the Roster's updateStudentProfile Server Action so
// the same allowlist + can_view check apply.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateStudentProfile } from '@/app/(tutor)/tutor/roster/actions';
import s from './StudentDetail.module.css';

/** Trigger + modal for the two profile fields a tutor reaches for
 *  most often on the student detail page: target SAT score + start
 *  date. Reuses the Roster's updateStudentProfile Server Action so
 *  the same allowlist + can_view check apply. */
export function EditTargetStartButton({ studentId, targetScore, startDate }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={s.editPill}
        onClick={() => setOpen(true)}
      >
        Edit target / start
      </button>
      {open && (
        <EditTargetStartModal
          studentId={studentId}
          targetScore={targetScore}
          startDate={startDate}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function EditTargetStartModal({ studentId, targetScore, startDate, onClose }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [target, setTarget] = useState(targetScore == null ? '' : String(targetScore));
  const [date, setDate] = useState(startDate ?? '');

  function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const patch = {
      target_sat_score: target === '' ? null : Number(target),
      start_date: date || null,
    };
    startTransition(async () => {
      const res = await updateStudentProfile({ studentId, patch });
      if (!res?.ok) {
        setError(res?.error ?? 'Could not save changes');
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className={s.modalOverlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit target + start date">
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <strong className={s.modalTitle}>Edit target + start date</strong>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={onSubmit} className={s.modalBody}>
          <label className={s.field}>
            <span className={s.fieldLabel}>Target SAT score</span>
            <input
              type="number"
              inputMode="numeric"
              min={400}
              max={1600}
              step={10}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoFocus
              className={s.input}
            />
          </label>
          <label className={s.field}>
            <span className={s.fieldLabel}>Start date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={s.input}
            />
            <span className={s.muted}>
              Leave blank to fall back to the day this student signed up.
            </span>
          </label>
          {error && <p role="alert" className={s.error}>{error}</p>}
          <div className={s.modalActions}>
            <button type="button" className={s.btnSecondary} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={s.btnPrimary} disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
