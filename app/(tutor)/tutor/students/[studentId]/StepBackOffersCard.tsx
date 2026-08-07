// §3.2 step-back-offers switch for the tutor's student-detail page.
//
// The same setting the student sees under /account → Practice
// experience; either side can change it and the other reads the
// result. Writes go through the roster's updateStudentProfile
// (can_view gate + service-role bypass), which carries this field
// on its allowlist.
//
// Tri-state under the hood — an unset preference resolves to off
// for a student with a tutor. Toggling always stores an explicit
// boolean, so linking or unlinking a tutor later never silently
// moves the switch.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DETOUR_COPY } from '@/lib/practice/detour-preference.mjs';
import { Toggle } from '@/lib/ui/Toggle';
import { updateStudentProfile } from '@/app/(tutor)/tutor/roster/actions';
import s from './StudentDetail.module.css';

interface StepBackOffersCardProps {
  studentId: string;
  enabled: boolean;
  isExplicit: boolean;
  hasAssignedTutor: boolean;
}

export function StepBackOffersCard({
  studentId,
  enabled,
  isExplicit,
  hasAssignedTutor,
}: StepBackOffersCardProps) {
  // Optimistic: move the switch now, reconcile on router.refresh().
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onToggle(next: boolean) {
    setChecked(next);
    setError(null);
    startTransition(async () => {
      const res = await updateStudentProfile({
        studentId,
        patch: { practice_detours_enabled: next },
      });
      if (!res.ok) {
        setChecked(!next);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.sectionLabel}>Practice experience</div>
      </div>

      <div className={s.toggleRow}>
        <Toggle
          checked={checked}
          onChange={onToggle}
          disabled={pending}
          label={DETOUR_COPY.label}
        />
        <div className={s.toggleText}>
          <span className={s.toggleLabel}>{DETOUR_COPY.label}</span>
          <span className={s.toggleHelp}>
            {checked ? DETOUR_COPY.tutor.on : DETOUR_COPY.tutor.off}
          </span>
          {!isExplicit && (
            <span className={s.toggleHelp}>
              {hasAssignedTutor
                ? 'Nobody has set this yet — off is the default for a student with a tutor.'
                : 'Nobody has set this yet — on is the default for a student without a tutor.'}
              {' '}The student can also change it from their Account page.
            </span>
          )}
        </div>
      </div>

      {error && <p role="alert" className={`${s.error} ${s.toggleError}`}>{error}</p>}
    </section>
  );
}
