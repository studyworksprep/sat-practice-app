// Module-review client island. Shows the Bluebook-style
// "Check your work" grid: one bubble per question with
// answered / flagged / unanswered state, each clickable to jump
// back to the matching runner position. Submit button fires the
// finishModule Server Action and routes forward.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkIcon } from '@/lib/ui/icons';
import { routeAfterFinish } from '../[position]/TestRunnerInteractive';
import s from './ModuleReview.module.css';

const WARNING_REMAINING_SECONDS = 5 * 60;
const CRITICAL_REMAINING_SECONDS = 60;

export function ModuleReviewInteractive({
  attemptId,
  moduleAttemptId,
  moduleInfo,
  items,
  finishModuleAction,
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Keep the countdown running on the review screen too — the
  // module clock doesn't pause here. Mirrors the runner page so
  // a student who spends too long reviewing auto-submits.
  const [secondsRemaining, setSecondsRemaining] = useState(() =>
    computeRemaining(moduleInfo.startedAt, moduleInfo.timeLimitSeconds),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsRemaining(
        computeRemaining(moduleInfo.startedAt, moduleInfo.timeLimitSeconds),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [moduleInfo.startedAt, moduleInfo.timeLimitSeconds]);

  const submitModule = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData();
    fd.set('moduleAttemptId', moduleAttemptId);
    try {
      const res = await finishModuleAction(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Could not submit module');
        setSubmitting(false);
        return;
      }
      routeAfterFinish(res, router, attemptId);
    } catch (err) {
      setError(err.message ?? String(err));
      setSubmitting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleAttemptId, attemptId, router, submitting]);

  // Auto-submit on timeout — same contract as the runner.
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (secondsRemaining > 0) return;
    if (autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    submitModule();
  }, [secondsRemaining, submitModule]);

  function jumpTo(position) {
    router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/${position}`);
  }

  const answered = items.filter((i) => i.answered).length;
  const marked = items.filter((i) => i.marked).length;
  const unanswered = items.length - answered;

  const timerClass = secondsRemaining <= CRITICAL_REMAINING_SECONDS
    ? `${s.timer} ${s.timerCritical}`
    : secondsRemaining <= WARNING_REMAINING_SECONDS
      ? `${s.timer} ${s.timerWarn}`
      : s.timer;

  const subjectName = moduleInfo.subject === 'RW' ? 'Reading & Writing' : 'Math';
  const moduleLabel = `${subjectName} · Module ${moduleInfo.moduleNumber}`;

  return (
    <div className={s.shell}>
      <div className={s.topBar}>
        <div className={s.topBarLeft}>
          <div className={s.testName}>{moduleInfo.testName}</div>
          <div className={s.moduleLabel}>{moduleLabel} · Review</div>
        </div>
        <div className={s.topBarCenter}>
          <div className={timerClass}>{formatClock(secondsRemaining)}</div>
        </div>
        <div className={s.topBarRight}>
          {/* Empty to preserve grid columns. */}
        </div>
      </div>

      <main className={s.main}>
        <header className={s.header}>
          <h1 className={s.h1}>Check your work</h1>
          <p className={s.sub}>
            Review your answers before submitting this module. Click
            any question to go back to it. Once you submit,{' '}
            {moduleInfo.subject === 'MATH' && moduleInfo.moduleNumber === 2
              ? 'you’ll see your test results.'
              : 'the next module starts immediately.'}
          </p>
        </header>

        <div className={s.summary}>
          <SummaryTile label="Answered" value={answered} total={items.length} tone="ok" />
          <SummaryTile label="Marked for review" value={marked} total={items.length} tone="warn" />
          <SummaryTile label="Unanswered" value={unanswered} total={items.length} tone={unanswered > 0 ? 'bad' : 'ok'} />
        </div>

        <div className={s.legend}>
          <span className={s.legendItem}>
            <span className={`${s.legendSwatch} ${s.swatchAnswered}`} />
            Answered
          </span>
          <span className={s.legendItem}>
            <BookmarkIcon filled size={14} className={s.legendFlag} />
            Flagged
          </span>
          <span className={s.legendItem}>
            <span className={`${s.legendSwatch} ${s.swatchUnanswered}`} />
            Unanswered
          </span>
        </div>

        <div className={s.grid} role="list">
          {items.map((it) => {
            const cls = [
              s.bubble,
              it.answered ? s.bubbleAnswered : s.bubbleUnanswered,
              it.marked ? s.bubbleFlagged : null,
            ].filter(Boolean).join(' ');
            return (
              <button
                key={it.position}
                type="button"
                className={cls}
                onClick={() => jumpTo(it.position)}
                aria-label={`Question ${it.position + 1}, ${it.answered ? 'answered' : 'unanswered'}${it.marked ? ', flagged' : ''}`}
              >
                <span className={s.bubbleNum}>{it.position + 1}</span>
                {it.marked && (
                  <BookmarkIcon filled size={12} className={s.bubbleFlag} />
                )}
              </button>
            );
          })}
        </div>

        {error && <p className={s.error} role="alert">{error}</p>}
      </main>

      <div className={s.bottomBar}>
        <button
          type="button"
          className={s.navBtnSecondary}
          onClick={() => jumpTo(Math.max(0, items.length - 1))}
        >
          ← Keep working
        </button>
        <button
          type="button"
          className={s.submitBtn}
          onClick={submitModule}
          disabled={submitting}
        >
          {submitting ? 'Submitting…' : 'Submit module'}
        </button>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, total, tone }) {
  const toneCls = tone === 'warn'
    ? s.summaryTileWarn
    : tone === 'bad'
      ? s.summaryTileBad
      : s.summaryTileOk;
  return (
    <div className={`${s.summaryTile} ${toneCls}`}>
      <div className={s.summaryValue}>
        {value}
        <span className={s.summaryTotal}> / {total}</span>
      </div>
      <div className={s.summaryLabel}>{label}</div>
    </div>
  );
}

function computeRemaining(startedAtIso, timeLimitSeconds) {
  const start = new Date(startedAtIso).getTime();
  const elapsedSec = (Date.now() - start) / 1000;
  return Math.max(0, Math.floor(timeLimitSeconds - elapsedSec));
}

function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
