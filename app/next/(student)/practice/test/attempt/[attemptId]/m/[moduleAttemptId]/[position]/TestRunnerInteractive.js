// Practice-test runner client island. Bluebook-style per-module
// runner: top bar with test name + module + timer, middle area
// with the question (via the shared QuestionRenderer in practice
// mode, no reveal), and a footer bar with Back / current position
// / mark-for-review / Next.
//
// Timer is derived from moduleInfo.startedAt (the server-side
// timestamp when the module began) + time_limit_seconds. This
// means reload doesn't reset the clock and the display always
// matches the server's view. When the timer hits zero, we call
// finishModule() — the server happily accepts a late submission
// within the GRACE_SECONDS window.

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import s from './TestRunner.module.css';

const WARNING_REMAINING_SECONDS = 5 * 60;   // under 5 min → warning tint
const CRITICAL_REMAINING_SECONDS = 60;      // under 1 min → critical tint

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

  // Countdown timer. Computed every second from moduleInfo.startedAt
  // so a reload or navigation preserves the true remaining time.
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

  // Debounced saver. Fires recordItemAnswer after the student
  // pauses input — keeps chatty keystrokes off the wire for SPR
  // but still catches every final answer.
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
    // MCQ answers save immediately — one radio click = one save.
    // SPR answers debounce so we don't fire on every keystroke.
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
        // Roll back the optimistic flip.
        setMarkedForReview(!optimistic);
        setSaveError(res?.error ?? 'Could not flag question');
      }
    } catch (err) {
      setMarkedForReview(!optimistic);
      setSaveError(err.message ?? String(err));
    }
  }

  // Navigation. On Next/Prev we flush any pending save first so
  // the answer always lands before the URL changes.
  async function flushBeforeNavigate() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pendingSaveRef.current) {
      await flushSave(pendingSaveRef.current);
      pendingSaveRef.current = null;
    }
  }

  const goToPosition = useCallback(async (newPosition) => {
    await flushBeforeNavigate();
    router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/${newPosition}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, moduleAttemptId, router]);

  async function goNext() {
    if (position + 1 >= total) {
      // Last question — jump straight to review.
      await flushBeforeNavigate();
      router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
      return;
    }
    await goToPosition(position + 1);
  }

  async function goPrev() {
    if (position === 0) return;
    await goToPosition(position - 1);
  }

  async function goToReview() {
    await flushBeforeNavigate();
    router.push(`/practice/test/attempt/${attemptId}/m/${moduleAttemptId}/review`);
  }

  // Timer auto-submit. Once remaining hits 0 we fire finishModule
  // and let the server route us forward. Guard with a ref so the
  // interval-driven tick doesn't fire the action more than once.
  const autoSubmitRef = useRef(false);
  useEffect(() => {
    if (secondsRemaining > 0) return;
    if (autoSubmitRef.current) return;
    autoSubmitRef.current = true;
    (async () => {
      await flushBeforeNavigate();
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

  const subjectName = moduleInfo.subject === 'RW' ? 'Reading & Writing' : 'Math';
  const moduleLabel = `${subjectName} · Module ${moduleInfo.moduleNumber}`;

  return (
    <div className={s.shell}>
      {/* Top bar ———————————————————————————————— */}
      <div className={s.topBar}>
        <div className={s.topBarLeft}>
          <div className={s.testName}>{moduleInfo.testName}</div>
          <div className={s.moduleLabel}>{moduleLabel}</div>
        </div>
        <div className={s.topBarCenter}>
          <div className={timerClass} aria-live="off">
            {formatClock(secondsRemaining)}
          </div>
        </div>
        <div className={s.topBarRight}>
          <button
            type="button"
            onClick={handleToggleMark}
            className={markedForReview ? `${s.markBtn} ${s.markBtnActive}` : s.markBtn}
            aria-pressed={markedForReview}
          >
            <span aria-hidden="true" className={s.markIcon}>★</span>
            Mark for review
          </button>
        </div>
      </div>

      {/* Question body ———————————————————————— */}
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
        />
        {saveError && (
          <p role="alert" className={s.saveError}>{saveError}</p>
        )}
      </main>

      {/* Bottom bar ———————————————————————————— */}
      <div className={s.bottomBar}>
        <button
          type="button"
          className={s.navBtnSecondary}
          onClick={goPrev}
          disabled={position === 0}
        >
          ← Back
        </button>
        <button
          type="button"
          className={s.reviewTrigger}
          onClick={goToReview}
        >
          Question {position + 1} of {total} ▾
        </button>
        <button
          type="button"
          className={s.navBtnPrimary}
          onClick={goNext}
        >
          {position + 1 >= total ? 'Review →' : 'Next →'}
        </button>
      </div>
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

// Route the client forward based on what finishModule returned.
// Exported pattern so the module-review page can share logic.
export function routeAfterFinish(res, router, attemptId) {
  if (!res?.ok) return;
  if (res.step === 'next-module' && res.nextModuleAttemptId) {
    router.push(`/practice/test/attempt/${attemptId}/m/${res.nextModuleAttemptId}/0`);
    return;
  }
  if (res.step === 'section-break' && res.nextModuleAttemptId) {
    // V1: no break screen — jump straight into Math module 1.
    router.push(`/practice/test/attempt/${attemptId}/m/${res.nextModuleAttemptId}/0`);
    return;
  }
  if (res.step === 'test-complete') {
    router.push(`/practice/test/attempt/${attemptId}/results`);
  }
}
