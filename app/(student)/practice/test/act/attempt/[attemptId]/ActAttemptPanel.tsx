// Intermission panel for an ACT attempt: the "before you begin"
// screen for section 1 and the between-sections screen afterwards
// (with the break countdown after Math). One primary action — start
// the current section — plus a way back to the hub and an abandon
// control. Starting a section is what starts its clock.

'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { minutesLabel, type PlanSectionStatus } from '@/lib/practice/act-test-plan';
import type { ActionResult } from '@/lib/types';
import s from './ActAttempt.module.css';

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult | null>;

export interface PanelSection {
  index: number;
  label: string;
  questionCount: number;
  timeLimitMs: number;
  breakAfterMs: number;
  status: PlanSectionStatus;
}

export function ActAttemptPanel({
  attemptId,
  sourceTest,
  formatLabel,
  timeMultiplier,
  sections,
  currentIndex,
  breakLeftMs,
  breakTotalMs,
  startSectionAction,
  abandonAction,
}: {
  attemptId: string;
  sourceTest: string;
  formatLabel: string;
  timeMultiplier: number;
  sections: PanelSection[];
  currentIndex: number;
  /** Break time still to run before the current section, in ms. */
  breakLeftMs: number;
  breakTotalMs: number;
  startSectionAction: Action;
  abandonAction: Action;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);

  const current = sections[currentIndex];
  const isFirst = currentIndex === 0;
  const done = sections.filter((x) => x.status === 'completed').length;

  function onStart() {
    setError(null);
    const fd = new FormData();
    fd.set('attempt_id', attemptId);
    startTransition(async () => {
      // startActSection redirects on success (Next's redirect throws
      // internally), so a return value only arrives on failure.
      const res = await startSectionAction(null, fd);
      if (res && res.ok === false) setError(res.error ?? 'Could not start the section.');
    });
  }

  async function onAbandon() {
    const ok = await confirm({
      title: 'Abandon this test?',
      body: 'Sections you finished stay on your record, but this attempt will not get a score and cannot be resumed.',
      confirmLabel: 'Abandon test',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    const fd = new FormData();
    fd.set('attempt_id', attemptId);
    startTransition(async () => {
      const res = await abandonAction(null, fd);
      if (res?.ok) router.push('/practice/tests?test=act');
      else setError(res?.error ?? 'Could not abandon the test.');
    });
  }

  return (
    <main className={s.shell}>
      <div className={s.card}>
        <div className={s.eyebrow}>ACT practice test</div>
        <h1 className={s.h1}>{sourceTest}</h1>
        <p className={s.sub}>
          {formatLabel} · {sections.length} section{sections.length === 1 ? '' : 's'}
          {timeMultiplier > 1 ? ` · ${timeMultiplier}× time` : ''}
          {done > 0 ? ` · ${done} of ${sections.length} done` : ''}
        </p>

        {breakLeftMs > 0 && (
          <BreakCard initialLeftMs={breakLeftMs} totalMs={breakTotalMs} />
        )}

        <ol className={s.sectionList}>
          {sections.map((sec) => {
            const isCurrent = sec.index === currentIndex;
            return (
              <li
                key={sec.index}
                className={`${s.sectionRow} ${isCurrent ? s.sectionRowCurrent : ''} ${sec.status === 'completed' ? s.sectionRowDone : ''}`}
              >
                <span className={s.sectionNum}>{sec.index + 1}</span>
                <span className={s.sectionName}>{sec.label}</span>
                <span className={s.sectionMeta}>
                  {sec.questionCount} question{sec.questionCount === 1 ? '' : 's'} · {minutesLabel(sec.timeLimitMs)}
                  {sec.breakAfterMs > 0 ? ` · then a ${minutesLabel(sec.breakAfterMs)} break` : ''}
                </span>
                <span className={`${s.pill} ${sec.status === 'completed' ? s.pillDone : isCurrent ? s.pillNext : ''}`}>
                  {sec.status === 'completed' ? 'Completed' : isCurrent ? 'Up next' : 'Later'}
                </span>
              </li>
            );
          })}
        </ol>

        <div className={s.rulesLabel}>{isFirst ? 'Before you begin' : 'Before you continue'}</div>
        <ul className={s.rules}>
          <li>
            The {current.label} clock starts when you press Start and does
            not pause. When it runs out, the section submits itself.
          </li>
          <li>
            Answers save as you move between questions; you can change an
            answer until the section ends, and you cannot return to a
            finished section.
          </li>
          <li>Scores appear on the results page after the last section.</li>
        </ul>

        {error && <div role="alert" className={s.error}>{error}</div>}

        <div className={s.actions}>
          <button type="button" className={s.btnPrimary} onClick={onStart} disabled={pending}>
            {pending
              ? 'Starting…'
              : `Start ${current.label} · ${minutesLabel(current.timeLimitMs)}`}
          </button>
          <Link href="/practice/tests?test=act" className={s.btnSecondary}>
            Back to practice tests
          </Link>
          <button type="button" className={s.btnGhost} onClick={onAbandon} disabled={pending}>
            Abandon test
          </button>
        </div>
      </div>
      {confirmDialog}
    </main>
  );
}

/** Break countdown. Pure display: the deadline is the previous
 *  section's finish plus the break length, computed server-side; the
 *  student may start the next section early. */
function BreakCard({ initialLeftMs, totalMs }: { initialLeftMs: number; totalMs: number }) {
  const [endAt] = useState(() => Date.now() + initialLeftMs);
  const [leftMs, setLeftMs] = useState(initialLeftMs);
  useEffect(() => {
    const t = setInterval(() => setLeftMs(Math.max(0, endAt - Date.now())), 1000);
    return () => clearInterval(t);
  }, [endAt]);

  const totalSeconds = Math.ceil(leftMs / 1000);
  const mm = Math.floor(totalSeconds / 60);
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return (
    <div className={s.breakCard} role="status">
      <div className={s.breakLabel}>Break</div>
      <div className={s.breakValue} suppressHydrationWarning>
        {leftMs > 0 ? `${mm}:${ss}` : 'Over'}
      </div>
      <div className={s.breakSub}>
        {leftMs > 0
          ? `${minutesLabel(totalMs)} break after Math. Stretch, get water — and start the next section whenever you're ready.`
          : 'The break is over. Start the next section when you are ready.'}
      </div>
    </div>
  );
}
