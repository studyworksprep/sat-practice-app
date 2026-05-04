// Test registrations panel for the tutor's student-detail page.
// Shows upcoming + past registrations and an inline Add modal.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/formatters';
import { addTestRegistration, removeTestRegistration } from './actions';
import s from './StudentDetail.module.css';

export function TestRegistrationsCard({ studentId, registrations }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const now = Date.now();
  const upcoming = registrations.filter((r) => Date.parse(r.test_date) > now);
  const past = registrations.filter((r) => Date.parse(r.test_date) <= now);

  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.sectionLabel}>Test registrations</div>
        <button
          type="button"
          className={s.cardHeaderLink}
          onClick={() => setOpen(true)}
        >
          + Add
        </button>
      </div>

      {registrations.length === 0 ? (
        <p className={s.empty}>No registrations yet.</p>
      ) : (
        <div className={s.regGrid}>
          {upcoming.length > 0 && (
            <div>
              <div className={s.regGroupLabel}>Upcoming</div>
              <ul className={s.regList}>
                {upcoming.map((r) => (
                  <RegRow
                    key={r.id}
                    studentId={studentId}
                    registration={r}
                    upcoming
                    onRemoved={() => router.refresh()}
                  />
                ))}
              </ul>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div className={s.regGroupLabel}>Past</div>
              <ul className={s.regList}>
                {past.map((r) => (
                  <RegRow
                    key={r.id}
                    studentId={studentId}
                    registration={r}
                    upcoming={false}
                    onRemoved={() => router.refresh()}
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {open && (
        <AddRegistrationModal
          studentId={studentId}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </section>
  );
}

function RegRow({ studentId, registration, upcoming, onRemoved }) {
  const [pending, startTransition] = useTransition();
  return (
    <li className={s.regRow}>
      <span className={upcoming ? s.regDateUpcoming : s.regDate}>
        {formatDate(registration.test_date)}
      </span>
      <button
        type="button"
        className={s.regRemove}
        disabled={pending}
        onClick={() => {
          if (!confirm('Remove this registration?')) return;
          const fd = new FormData();
          fd.set('student_id', studentId);
          fd.set('id', registration.id);
          startTransition(async () => {
            const res = await removeTestRegistration(null, fd);
            if (res?.ok) onRemoved?.();
          });
        }}
        aria-label="Remove registration"
      >
        ✕
      </button>
    </li>
  );
}

function AddRegistrationModal({ studentId, onClose, onSaved }) {
  const [testDate, setTestDate] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function onSubmit(e) {
    e.preventDefault();
    if (!testDate) return;
    setError(null);
    const fd = new FormData();
    fd.set('student_id', studentId);
    fd.set('test_date', testDate);
    startTransition(async () => {
      const res = await addTestRegistration(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Could not save');
        return;
      }
      onSaved?.();
    });
  }

  return (
    <div className={s.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <strong className={s.modalTitle}>Add test registration</strong>
          <button type="button" className={s.modalClose} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={onSubmit} className={s.modalBody}>
          <label className={s.field}>
            <span className={s.fieldLabel}>SAT test date</span>
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              required
              autoFocus
              className={s.input}
            />
          </label>
          {error && <p role="alert" className={s.error}>{error}</p>}
          <div className={s.modalActions}>
            <button type="button" className={s.btnSecondary} onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className={s.btnPrimary} disabled={pending}>
              {pending ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
