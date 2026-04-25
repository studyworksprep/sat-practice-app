// Practice session client island. Owns the session state (position,
// selection, submit, navigation) and delegates question rendering
// to <QuestionRenderer mode="practice">. This split is Phase 4's
// intended shape: one QuestionRenderer that serves practice /
// review / teacher modes from a single codebase.
//
// Design notes per docs/architecture-plan.md §3.7:
//   - We never fetch data from the server outside of Server Action
//     invocations. No useEffect + fetch pattern.
//   - The question HTML strings are server-rendered (watermarked)
//     and passed as props to the renderer, which inserts them via
//     dangerouslySetInnerHTML.
//   - The correct answer and rationale arrive only from the
//     submitAnswer action result, after the server has verified
//     the attempt row exists.
//   - basePath and sessionCompleteHref are parameters so the same
//     client island works for both /practice/* and /tutor/training/*
//     without branching on role.

'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { DesmosPanel } from '@/lib/ui/DesmosPanel';
import { CalculatorIcon } from '@/lib/ui/icons';
import { ConceptTags } from './ConceptTags';
import { DesmosSavedStateButton } from './DesmosSavedStateButton';
import { submitPracticeSession } from './session-actions';
import s from './PracticeInteractive.module.css';

// Which domains justify showing the Desmos toggle. Reading-
// section questions (CAS / EOI / INI / SEC) don't get it since
// a graphing calculator isn't relevant to those items.
const CALCULATOR_DOMAINS = new Set(['H', 'P', 'Q', 'S']);

// LocalStorage key for the student's open/closed preference.
// Sticky across navigations so a student doesn't have to reopen
// the calculator on every question.
const DESMOS_TOGGLE_KEY = 'sw:desmos-open';

export function PracticeInteractive({
  question,
  session,
  initialAttempt,
  submitAnswerAction,
  basePath = '/practice',
  sessionCompleteHref = '/dashboard?session_complete=1',
  desmosSavedState = null,
  desmosCanSave = false,
  conceptTags = null,
}) {
  const router = useRouter();
  const [pendingTransition, startTransition] = useTransition();

  const isSpr = question.questionType === 'spr';

  const [selectedId, setSelectedId] = useState(initialAttempt?.selectedOptionId ?? null);
  const [responseText, setResponseText] = useState(initialAttempt?.responseText ?? '');
  const [result, setResult] = useState(
    initialAttempt
      ? {
          isCorrect: initialAttempt.isCorrect,
          correctOptionId: initialAttempt.correctOptionId ?? null,
          correctAnswerDisplay: initialAttempt.correctAnswerDisplay ?? null,
          rationaleHtml: initialAttempt.rationaleHtml ?? null,
        }
      : null,
  );
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const isReviewed = !!result;
  const canSubmit = isSpr ? responseText.trim().length > 0 : !!selectedId;

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (isReviewed || submitting || !canSubmit) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const fd = new FormData();
        fd.set('sessionId', session.sessionId);
        fd.set('position', String(session.position));
        if (isSpr) fd.set('responseText', responseText);
        else if (selectedId) fd.set('optionId', selectedId);
        const res = await submitAnswerAction(null, fd);
        if (res?.ok) {
          setResult({
            isCorrect: res.isCorrect,
            correctOptionId: res.correctOptionId ?? null,
            correctAnswerDisplay: res.correctAnswerDisplay ?? null,
            rationaleHtml: res.rationaleHtml ?? null,
          });
        } else {
          setSubmitError(res?.error ?? 'Unable to grade this question.');
        }
      } catch (err) {
        setSubmitError(err.message ?? 'Unable to grade this question.');
      } finally {
        setSubmitting(false);
      }
    },
    [
      session.sessionId, session.position,
      responseText, selectedId, submitAnswerAction,
      isReviewed, canSubmit, isSpr, submitting,
    ],
  );

  const isLastPosition = session.position + 1 >= session.total;

  const handleNext = useCallback(() => {
    startTransition(async () => {
      const nextPosition = session.position + 1;
      if (nextPosition < session.total) {
        router.push(`${basePath}/s/${session.sessionId}/${nextPosition}`);
        return;
      }
      // Last position — explicitly close out the session before
      // navigating. The action is idempotent so a reload during
      // the transition is safe.
      const fd = new FormData();
      fd.set('sessionId', session.sessionId);
      try { await submitPracticeSession(null, fd); } catch {}
      router.push(sessionCompleteHref);
    });
  }, [router, session.sessionId, session.position, session.total, basePath, sessionCompleteHref]);

  const handlePrev = useCallback(() => {
    if (session.position <= 0) return;
    startTransition(() => {
      router.push(`${basePath}/s/${session.sessionId}/${session.position - 1}`);
    });
  }, [router, session.sessionId, session.position, basePath]);

  const isNavigating = pendingTransition;

  // Desmos visibility. Only offered for math-domain questions;
  // the toggle state is sticky via localStorage so a student who
  // opens it once stays opened-in across navigations. The initial
  // localStorage restore runs in an effect — not in useState's
  // initializer — so server + first-client renders agree and the
  // grid-track transition doesn't fire on mount.
  const desmosEligible = CALCULATOR_DOMAINS.has(question.taxonomy?.domain_code ?? '');
  const [desmosOpen, setDesmosOpen] = useState(false);
  const [desmosAnimate, setDesmosAnimate] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    // Default-on when the student has never explicitly toggled.
    // Only an explicit '0' (student closed it) keeps it closed.
    // Matches the practice-test runner's default-on policy so the
    // two surfaces behave the same way.
    const stored = window.localStorage.getItem(DESMOS_TOGGLE_KEY);
    setDesmosOpen(stored == null ? true : stored === '1');
  }, []);
  const toggleDesmos = useCallback(() => {
    // Animation is gated behind the first user interaction. Before
    // this point the calculator pane either opens or stays closed
    // statically; after it, subsequent toggles glide.
    setDesmosAnimate(true);
    setDesmosOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(DESMOS_TOGGLE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const desmosVisible = desmosEligible && desmosOpen;

  // Live calc instance from DesmosPanel — populated via onCalcReady,
  // consumed by DesmosSavedStateButton's Save / Load actions. Only
  // valid while the panel is open.
  const calcRef = useRef(null);
  const showSavedStateBtn = desmosEligible && (desmosCanSave || desmosSavedState != null);

  const calcBtnClass = `${s.navBtn} ${desmosOpen ? s.navBtnActive : ''}`;

  return (
    <main className={s.main}>
      <header className={s.header}>
        <div className={s.headerLeft}>
          <span className={s.progress}>
            Question {session.position + 1} of {session.total}
          </span>
          {question.taxonomy && (
            <span className={s.meta}>
              {question.taxonomy.domain_name}
              {question.taxonomy.skill_name ? ` · ${question.taxonomy.skill_name}` : ''}
              {question.taxonomy.difficulty ? ` · difficulty ${question.taxonomy.difficulty}` : ''}
            </span>
          )}
        </div>
        <div className={s.headerCenter}>
          <span className={s.progressPill}>
            Q {session.position + 1} / {session.total}
          </span>
        </div>
        <div className={s.headerRight}>
          {desmosEligible && (
            <button
              type="button"
              onClick={toggleDesmos}
              aria-pressed={desmosOpen}
              className={calcBtnClass}
              title="Toggle the Desmos graphing calculator"
            >
              <CalculatorIcon />
              Calculator
            </button>
          )}
          {showSavedStateBtn && (
            <DesmosSavedStateButton
              questionId={question.questionId}
              initialSavedState={desmosSavedState}
              canSave={desmosCanSave}
              calcRef={calcRef}
            />
          )}
          <button
            type="button"
            onClick={handlePrev}
            disabled={session.position <= 0 || isNavigating}
            className={`${s.navBtn} ${s.navBtnIcon}`}
            aria-label="Previous question"
            title="Previous question"
          >
            ←
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isNavigating}
            className={`${s.navBtn} ${s.navBtnIcon}`}
            aria-label="Next question"
            title="Next question"
          >
            →
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit} className={s.article}>
        <QuestionRenderer
          mode="practice"
          layout={question.layout ?? 'single'}
          question={question}
          selectedOptionId={selectedId}
          onSelectOption={setSelectedId}
          responseText={responseText}
          onResponseText={setResponseText}
          result={result}
          leftSlot={
            desmosEligible ? (
              <DesmosPanel
                isOpen={desmosVisible}
                storageKey={`desmos:practice:${question.questionId}`}
                onCalcReady={(c) => { calcRef.current = c; }}
              />
            ) : null
          }
          leftSlotCollapsed={desmosEligible && !desmosVisible}
          slotAnimate={desmosAnimate}
          controlsNode={
            <div className={s.controls}>
              {!isReviewed && (
                <Button type="submit" disabled={submitting || !canSubmit}>
                  {submitting ? 'Checking…' : 'Submit'}
                </Button>
              )}
              {submitError && (
                <p role="alert" className={s.error}>
                  {submitError}
                </p>
              )}
              {isReviewed && (
                <Button type="button" onClick={handleNext}>
                  {isLastPosition ? 'Submit Set →' : 'Next question →'}
                </Button>
              )}
            </div>
          }
        />
      </form>

      {conceptTags?.canTag && (
        <div className={s.tutorTools}>
          <ConceptTags
            key={`tags-${question.questionId}`}
            questionId={question.questionId}
            initialTags={conceptTags.tags}
            initialQuestionTagIds={conceptTags.questionTagIds}
            canTag={conceptTags.canTag}
            canDelete={conceptTags.canDelete}
          />
        </div>
      )}
    </main>
  );
}
