// Practice-test runner client island — Bluebook-style shell.
//
// Top bar: "Section N, Module M: Subject" on the left, countdown
// timer in the center. Mark-for-Review is not here — it lives
// inside the question header (see headerNode passed to
// QuestionRenderer) so it sits next to the question number
// exactly like Bluebook shows.
//
// Bottom bar: a centered "Question N of M ▾" pill that opens the
// navigator popup (grid of question bubbles + "Go to Review Page"
// button). Next / Back are on the right.
//
// Timer derives from moduleInfo.startedAt + timeLimitSeconds;
// timeLimitSeconds arrives already multiplied by the student's
// time-accommodation on the parent attempt, so no client-side
// multiplication here.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import s from './TestRunner.module.css';

const WARNING_REMAINING_SECONDS = 5 * 60;
const CRITICAL_REMAINING_SECONDS = 60;

export function TestRunnerInteractive({
  attemptId,
  moduleAttemptId,
  moduleItemId,
  position,
  total,
  moduleInfo,
  navItems,
  question,
  initialAnswer,
  recordItemAnswerAction,
  toggleMarkForReviewAction,
  finishModuleAction,
}) {
  const router = useRouter();

  const [selectedId, setSelectedId] = useState(initialAnswer.selectedOptionId ?? null);
  const [responseText, setResponseText] = useState(initialAnswer.responseText ?? '');
  const [markedForReview, setMarkedForReview] = useState(!!initialAnswer.markedForReview);
  const [saveError, setSaveError] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  // useTransition lets us render a "pending" state on the Next/Back
  // buttons while the server fetches the next question. Without
  // this, router.push appears to do nothing until the new page is
  // ready — exactly the "it's unresponsive, click it again" trap
  // the user ran into.
  const [isNavPending, startNav] = useTransition();

  // Prefetch the neighbor question + review pages. Next.js App
  // Router's prefetch loads the RSC payload and hydrates on arrival
  // so Next/Back become near-instant. Runs on mount + whenever
  // position changes.
  useEffect(() => {
    if (position > 0) {
      router.prefetch(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/${position - 1}`);
    }
    if (position + 1 < total) {
      router.prefetch(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/${position + 1}`);
    } else {
      router.prefetch(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
    }
  }, [attemptId, moduleAttemptId, position, total, router]);

  // ── Timer ─────────────────────────────────────────────────
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

  // ── Answer save (debounced for SPR, immediate for MCQ) ────
  const saveTimer = useRef(null);
  const pendingSaveRef = useRef(null);

  const flushSave = useCallback(async (answer) => {
    const fd = new FormData();
    fd.set('moduleAttemptId', moduleAttemptId);
    fd.set('moduleItemId', moduleItemId);
    if (question.questionType === 'spr') {
      fd.set('responseText', answer.responseText ?? '');
    } else if (answer.selectedOptionId) {
      fd.set('optionId', answer.selectedOptionId);
    }
    try {
      const res = await recordItemAnswerAction(null, fd);
      if (!res?.ok) setSaveError(res?.error ?? 'Could not save');
      else setSaveError(null);
    } catch (err) {
      setSaveError(err.message ?? String(err));
    }
  }, [moduleAttemptId, moduleItemId, question.questionType, recordItemAnswerAction]);

  function scheduleSave(next) {
    pendingSaveRef.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const delay = question.questionType === 'spr' ? 600 : 0;
    saveTimer.current = setTimeout(() => {
      flushSave(pendingSaveRef.current);
    }, delay);
  }

  function handleSelectOption(id) {
    setSelectedId(id);
    scheduleSave({ selectedOptionId: id });
  }

  function handleResponseText(text) {
    setResponseText(text);
    scheduleSave({ responseText: text });
  }

  async function handleToggleMark() {
    const optimistic = !markedForReview;
    setMarkedForReview(optimistic);
    const fd = new FormData();
    fd.set('moduleAttemptId', moduleAttemptId);
    fd.set('moduleItemId', moduleItemId);
    try {
      const res = await toggleMarkForReviewAction(null, fd);
      if (res?.ok && typeof res.marked === 'boolean') {
        setMarkedForReview(res.marked);
      } else if (!res?.ok) {
        setMarkedForReview(!optimistic);
        setSaveError(res?.error ?? 'Could not flag question');
      }
    } catch (err) {
      setMarkedForReview(!optimistic);
      setSaveError(err.message ?? String(err));
    }
  }

  // Fire any pending save without awaiting — Server Actions run on
  // their own and we don't need to block navigation on the round-
  // trip. The user already saw the answer selected; if the save
  // fails, the next page will refetch the last-saved answer from
  // the server. Keeping navigation snappy is the priority.
  function flushSavePendingInBackground() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pendingSaveRef.current) {
      const payload = pendingSaveRef.current;
      pendingSaveRef.current = null;
      flushSave(payload).catch(() => {});
    }
  }

  const goToPosition = useCallback((newPosition) => {
    flushSavePendingInBackground();
    setNavOpen(false);
    startNav(() => {
      router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/${newPosition}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, moduleAttemptId, router]);

  function goNext() {
    if (position + 1 >= total) {
      flushSavePendingInBackground();
      setNavOpen(false);
      startNav(() => {
        router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
      });
      return;
    }
    goToPosition(position + 1);
  }

  function goPrev() {
    if (position === 0) return;
    goToPosition(position - 1);
  }

  function goToReview() {
    flushSavePendingInBackground();
    setNavOpen(false);
    startNav(() => {
      router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
    });
  }

  // Auto-submit on timeout. We DO await the pending save here
  // (unlike user-driven navigation) because the module is closing
  // and we want the last answer durably recorded before the
  // server-side finishModule counts correct answers.
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (secondsRemaining > 0) return;
    if (autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    (async () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (pendingSaveRef.current) {
        try { await flushSave(pendingSaveRef.current); } catch {}
        pendingSaveRef.current = null;
      }
      const fd = new FormData();
      fd.set('moduleAttemptId', moduleAttemptId);
      try {
        const res = await finishModuleAction(null, fd);
        routeAfterFinish(res, router, attemptId);
      } catch (err) {
        setSaveError(err.message ?? String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsRemaining]);

  const timerClass = useMemo(() => {
    if (secondsRemaining <= CRITICAL_REMAINING_SECONDS) return `${s.timer} ${s.timerCritical}`;
    if (secondsRemaining <= WARNING_REMAINING_SECONDS) return `${s.timer} ${s.timerWarn}`;
    return s.timer;
  }, [secondsRemaining]);

  const subjectName = moduleInfo.subject === 'RW' ? 'Reading and Writing' : 'Math';
  const moduleLabel = `Section ${moduleInfo.subject === 'RW' ? 1 : 2}, Module ${moduleInfo.moduleNumber}: ${subjectName}`;

  // Build the question header passed into QuestionRenderer.
  const headerNode = (
    <div className={s.questionHeader}>
      <span className={s.questionNumChip}>{position + 1}</span>
      <button
        type="button"
        onClick={handleToggleMark}
        className={markedForReview ? `${s.markBtn} ${s.markBtnActive}` : s.markBtn}
        aria-pressed={markedForReview}
      >
        <span aria-hidden="true" className={s.markIcon}>
          {markedForReview ? '🔖' : '🔖'}
        </span>
        Mark for Review
      </button>
    </div>
  );

  return (
    <div className={s.shell}>
      {/* Top bar ———————————————————————————— */}
      <div className={s.topBar}>
        <div className={s.topBarLeft}>
          <div className={s.moduleLabel}>{moduleLabel}</div>
          <div className={s.testName}>{moduleInfo.testName}</div>
        </div>
        <div className={s.topBarCenter}>
          <div className={timerClass} aria-live="off">
            {formatClock(secondsRemaining)}
          </div>
        </div>
        <div className={s.topBarRight}>
          {/* Empty for now — Annotate / More tools land as a follow-up. */}
        </div>
      </div>

      {/* Question body ————————————————————— */}
      <main className={s.main}>
        <QuestionRenderer
          mode="practice"
          layout={question.layout ?? 'single'}
          question={question}
          selectedOptionId={selectedId}
          onSelectOption={handleSelectOption}
          responseText={responseText}
          onResponseText={handleResponseText}
          result={null}
          headerNode={headerNode}
        />
        {saveError && (
          <p role="alert" className={s.saveError}>{saveError}</p>
        )}
      </main>

      {/* Bottom bar ———————————————————————— */}
      <div className={s.bottomBar}>
        <div className={s.bottomBarLeft} />
        <div className={s.bottomBarCenter}>
          <NavPopover
            open={navOpen}
            onClose={() => setNavOpen(false)}
            moduleLabel={moduleLabel}
            navItems={navItems}
            currentPosition={position}
            onJump={(p) => goToPosition(p)}
            onReview={goToReview}
          />
          <button
            type="button"
            className={s.reviewTrigger}
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
          >
            Question {position + 1} of {total}
            <span className={s.reviewTriggerChevron} aria-hidden="true">▾</span>
          </button>
        </div>
        <div className={s.bottomBarRight}>
          <button
            type="button"
            className={`${s.navBtnSecondary} ${isNavPending ? s.navBtnBusy : ''}`}
            onClick={goPrev}
            disabled={position === 0 || isNavPending}
          >
            Back
          </button>
          <button
            type="button"
            className={`${s.navBtnPrimary} ${isNavPending ? s.navBtnBusy : ''}`}
            onClick={goNext}
            disabled={isNavPending}
          >
            Next
          </button>
        </div>
      </div>

      {/* Top-of-viewport progress strip while nav is pending.
          Gives the student an instant "something is happening"
          cue even while the server fetches the next question. */}
      {isNavPending && <div className={s.navProgress} aria-hidden="true" />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Navigator popover
// ──────────────────────────────────────────────────────────────

function NavPopover({ open, onClose, moduleLabel, navItems, currentPosition, onJump, onReview }) {
  const popRef = useRef(null);

  // Close on click-outside + Escape.
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (popRef.current && !popRef.current.contains(e.target)) {
        onClose();
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    // Defer attaching the click handler one tick so the click that
    // opened the popover doesn't immediately close it.
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={popRef} className={s.navPop} role="dialog" aria-modal="true" aria-label="Navigate questions">
      <div className={s.navPopHeader}>
        <div className={s.navPopTitle}>{moduleLabel} Questions</div>
        <button type="button" className={s.navPopClose} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className={s.navPopLegend}>
        <span className={s.legendItem}>
          <span className={`${s.legendSwatch} ${s.swatchCurrent}`} aria-hidden="true">📍</span>
          Current
        </span>
        <span className={s.legendItem}>
          <span className={`${s.legendSwatch} ${s.swatchUnanswered}`} />
          Unanswered
        </span>
        <span className={s.legendItem}>
          <span className={`${s.legendSwatch} ${s.swatchFlagged}`} aria-hidden="true">🚩</span>
          For Review
        </span>
      </div>
      <div className={s.navPopGrid} role="list">
        {navItems.map((it) => {
          const isCurrent = it.position === currentPosition;
          const cls = [
            s.navBubble,
            it.answered ? s.navBubbleAnswered : s.navBubbleUnanswered,
            isCurrent ? s.navBubbleCurrent : null,
          ].filter(Boolean).join(' ');
          return (
            <button
              key={it.position}
              type="button"
              className={cls}
              onClick={() => onJump(it.position)}
              aria-current={isCurrent ? 'true' : undefined}
            >
              {isCurrent && <span className={s.bubblePin} aria-hidden="true">📍</span>}
              <span className={s.bubbleNum}>{it.position + 1}</span>
              {it.marked && <span className={s.bubbleFlag} aria-hidden="true">🚩</span>}
            </button>
          );
        })}
      </div>
      <button type="button" className={s.reviewPageBtn} onClick={onReview}>
        Go to Review Page
      </button>
      <div className={s.navPopTail} aria-hidden="true" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

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

export function routeAfterFinish(res, router, attemptId) {
  if (!res?.ok) return;
  if (res.step === 'next-module' && res.nextModuleAttemptId) {
    router.push(`/practice/test/attempt/${attemptId}/m/${res.nextModuleAttemptId}/0`);
    return;
  }
  if (res.step === 'section-break' && res.nextModuleAttemptId) {
    router.push(`/practice/test/attempt/${attemptId}/m/${res.nextModuleAttemptId}/0`);
    return;
  }
  if (res.step === 'test-complete') {
    router.push(`/practice/test/attempt/${attemptId}/results`);
  }
}
