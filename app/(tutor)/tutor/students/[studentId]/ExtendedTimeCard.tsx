// Extended-time accommodation card for the tutor's student-detail
// page: the same profiles.time_accommodation the student sees under
// /account → Practice experience. Either side can change it. Writes go
// through the roster's updateStudentProfile (can_view gate +
// service-role bypass), which carries the field on its allowlist.
//
// It is a standing setting: every timed practice test (SAT modules,
// ACT sections) pre-selects it, and an assignment-started ACT test
// uses it outright; each attempt records the multiplier it ran with.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  TIME_ACCOMMODATIONS,
  TIME_ACCOMMODATION_LABELS,
  parseTimeAccommodation,
  type TimeAccommodation,
} from '@/lib/practice/time-accommodation';
import { updateStudentProfile } from '@/app/(tutor)/tutor/roster/actions';
import s from './StudentDetail.module.css';

export function ExtendedTimeCard({
  studentId,
  value,
}: {
  studentId: string;
  value: TimeAccommodation;
}) {
  const [current, setCurrent] = useState<TimeAccommodation>(value);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onChange(raw: string) {
    const next = parseTimeAccommodation(raw);
    const prev = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const res = await updateStudentProfile({
        studentId,
        patch: { time_accommodation: next },
      });
      if (!res.ok) {
        setCurrent(prev);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.sectionLabel}>Extended time</div>
      </div>

      <div className={s.toggleRow}>
        <select
          value={String(current)}
          onChange={(e) => onChange(e.target.value)}
          disabled={pending}
          aria-label="Extended-time accommodation for timed practice tests"
        >
          {TIME_ACCOMMODATIONS.map((m) => (
            <option key={m} value={String(m)}>{TIME_ACCOMMODATION_LABELS[m]}</option>
          ))}
        </select>
        <div className={s.toggleText}>
          <span className={s.toggleLabel}>Timed practice tests</span>
          <span className={s.toggleHelp}>
            Pre-selected on every SAT and ACT practice-test launch and
            applied as-is when one of your assignments starts a test.
            The student can also change it from their Account page.
          </span>
        </div>
      </div>

      {error && <p role="alert" className={`${s.error} ${s.toggleError}`}>{error}</p>}
    </section>
  );
}
