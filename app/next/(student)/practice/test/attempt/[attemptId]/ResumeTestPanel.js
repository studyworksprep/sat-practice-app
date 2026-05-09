// "Resume test" landing card. Shown by the attempt-entry page
// when the most-recent unfinished module is paused (the student
// hit Save and Exit during the test). One button — Resume —
// fires the resumeTestModule Server Action and navigates the
// student back into the runner at the position they were on.
//
// Cancel sends them back to the dashboard so a misclick out of
// the test doesn't strand them on a half-loaded runner.

'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import s from './ResumeTestPanel.module.css';

export function ResumeTestPanel({
  attemptId,
  moduleAttemptId,
  testName,
  subject,
  moduleNumber,
  pausedAtIso,
  resumeTestModuleAction,
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  function handleResume() {
    start(async () => {
      const fd = new FormData();
      fd.set('moduleAttemptId', moduleAttemptId);
      const res = await resumeTestModuleAction(null, fd);
      if (res?.ok) {
        const position = Number.isInteger(res.position) ? res.position : 0;
        router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/${position}`);
      }
    });
  }

  const subjectName = subject === 'RW' ? 'Reading and Writing' : 'Math';
  const sectionNumber = subject === 'RW' ? 1 : 2;

  return (
    <main className={s.shell}>
      <div className={s.card}>
        <div className={s.eyebrow}>Test paused</div>
        <h1 className={s.h1}>{testName}</h1>
        <p className={s.sub}>
          You paused on <strong>Section {sectionNumber}, Module{' '}
          {moduleNumber} — {subjectName}</strong>
          {pausedAtIso && (
            <>
              {' '}on <span className={s.dateChip}>{formatPausedAt(pausedAtIso)}</span>
            </>
          )}.
          The module timer is frozen — pressing Resume picks up
          right where you left off.
        </p>
        <div className={s.actions}>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={handleResume}
            disabled={isPending}
          >
            {isPending ? 'Resuming…' : 'Resume test'}
          </button>
          <Link href="/dashboard" className={s.btnSecondary}>
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

function formatPausedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hhmm = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (sameDay) return `today at ${hhmm}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${hhmm}`;
}
