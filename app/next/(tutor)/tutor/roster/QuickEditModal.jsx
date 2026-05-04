// QuickEdit modal for the Roster page. Submits a small allowlist
// of profile fields to updateStudentProfile.
//
// Field set tracks what tutors actually maintain in our spreadsheet
// today: name, school, graduation year, target score, planned SAT
// test date, start date, active flag. Anything else (role, email,
// is_admin, etc.) lives elsewhere — admin-side, not here.
//
// Submission flow: Form → useTransition → action → close + router
// refresh on success. Error inline under the submit button so the
// modal stays open and the tutor can fix and retry.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateStudentProfile } from './actions';
import s from './Roster.module.css';

export function QuickEditModal({ student, onClose }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  // Local form state, seeded from the student's current values.
  const [firstName, setFirstName] = useState(student.firstName ?? '');
  const [lastName, setLastName]   = useState(student.lastName ?? '');
  const [highSchool, setHighSchool] = useState(student.highSchool ?? '');
  const [graduationYear, setGraduationYear] = useState(
    student.graduationYear == null ? '' : String(student.graduationYear),
  );
  const [targetScore, setTargetScore] = useState(
    student.targetScore == null ? '' : String(student.targetScore),
  );
  const [satTestDate, setSatTestDate] = useState(student.satTestDate ?? '');
  const [startDate, setStartDate] = useState(student.startDate ?? '');
  const [isActive, setIsActive] = useState(student.isActive !== false);

  function onSubmit(e) {
    e.preventDefault();
    setError(null);

    const patch = {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      high_school: highSchool.trim() || null,
      graduation_year: graduationYear === '' ? null : Number(graduationYear),
      target_sat_score: targetScore === '' ? null : Number(targetScore),
      sat_test_date: satTestDate || null,
      start_date: startDate || null,
      is_active: isActive,
    };

    startTransition(async () => {
      const res = await updateStudentProfile({ studentId: student.id, patch });
      if (!res?.ok) {
        setError(res?.error ?? 'Could not save changes');
        return;
      }
      onClose();
      // Force the Server Component to re-fetch with the updated row.
      router.refresh();
    });
  }

  return (
    <div className={s.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit student profile">
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <strong className={s.modalTitle}>Edit student</strong>
          <button
            type="button"
            className={s.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} className={s.modalBody}>
          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>First name</span>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={s.input}
                autoFocus
              />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Last name</span>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={s.input}
              />
            </label>
          </div>

          <label className={s.field}>
            <span className={s.fieldLabel}>School</span>
            <input
              type="text"
              value={highSchool}
              onChange={(e) => setHighSchool(e.target.value)}
              className={s.input}
            />
          </label>

          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>Graduation year</span>
              <input
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                className={s.input}
              />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Target SAT score</span>
              <input
                type="number"
                inputMode="numeric"
                min={400}
                max={1600}
                step={10}
                value={targetScore}
                onChange={(e) => setTargetScore(e.target.value)}
                className={s.input}
              />
            </label>
          </div>

          <div className={s.fieldRow}>
            <label className={s.field}>
              <span className={s.fieldLabel}>SAT test date</span>
              <input
                type="date"
                value={satTestDate}
                onChange={(e) => setSatTestDate(e.target.value)}
                className={s.input}
              />
            </label>
            <label className={s.field}>
              <span className={s.fieldLabel}>Start date</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={s.input}
              />
            </label>
          </div>

          <label className={s.activeRow}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active</span>
            <span className={s.muted}>
              {isActive ? 'Will appear in active rosters and dashboards.' : 'Hidden from default views.'}
            </span>
          </label>

          {error && (
            <p role="alert" className={s.error}>{error}</p>
          )}

          <div className={s.actions}>
            <button
              type="button"
              className={s.btnSecondary}
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={s.btnPrimary}
              disabled={pending}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
