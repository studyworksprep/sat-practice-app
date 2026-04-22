// Practice session client island. Owns the session state (position,
// selection, submit, navigation) and delegates question rendering to
// <QuestionRenderer mode="practice">. This split is Phase 4's
// intended shape: one QuestionRenderer that serves practice / review
// / teacher modes from a single codebase.
//
// Design notes per docs/architecture-plan.md §3.7:
//   - We never fetch data from the server outside of Server Action
//     invocations. No useEffect + fetch pattern.
//   - The question HTML strings are server-rendered (watermarked) and
//     passed as props to the renderer, which inserts them via
//     dangerouslySetInnerHTML.
//   - The correct answer and rationale arrive only from the
//     submitAnswer action result, after the server has verified the
//     attempt row exists.
//   - basePath and sessionCompleteHref are parameters so the same
//     client island works for both /practice/* and /tutor/training/*
//     without branching on role.

'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/lib/ui/Button';
import { QuestionRenderer } from '@/lib/ui/QuestionRenderer';
import { DesmosPanel } from '@/lib/ui/DesmosPanel';

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
}) {
  const router = useRouter();
  const [pendingTransition, startTransition] = useTransition();

  const isSpr = question.questionType === 'spr';

  // Local UI state for the in-flight answer. MCQ uses selectedId,
  // SPR uses responseText. When the student is revisiting a question
  // they already submitted, `initialAttempt` carries the review
  // reveal data loaded server-side via lib/practice/load-review-data.js.
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
    async (event) => {
      event?.preventDefault?.();
      if (submitting || isReviewed) return;
      if (!canSubmit) {
        setSubmitError(
          isSpr ? 'Please enter an answer first.' : 'Please select an option first.',
        );
        return;
      }
      setSubmitError(null);
      setSubmitting(true);
      try {
        const res = await submitAnswerAction(session.sessionId, session.position, {
          optionId: isSpr ? null : selectedId,
          responseText: isSpr ? responseText.trim() : null,
        });
        if (res && res.ok) {
          setResult({
            isCorrect: res.data.isCorrect,
            correctOptionId: res.data.correctOptionId,
            correctAnswerDisplay: res.data.correctAnswerDisplay,
            rationaleHtml: res.data.rationaleHtml,
          });
        } else {
          setSubmitError(res?.error ?? 'Submission failed');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitAnswerAction,
      session.sessionId,
      session.position,
      selectedId,
      responseText,
      submitting,
      isReviewed,
      canSubmit,
      isSpr,
    ],
  );

  const handleNext = useCallback(() => {
    startTransition(() => {
      const nextPosition = session.position + 1;
      if (nextPosition >= session.total) {
        router.push(sessionCompleteHref);
      } else {
        router.push(`${basePath}/s/${session.sessionId}/${nextPosition}`);
      }
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
  // the toggle state is sticky across navigations via localStorage
  // so a student who opens it once stays opened-in.
  const desmosEligible = CALCULATOR_DOMAINS.has(question.taxonomy?.domain_code ?? '');
  const [desmosOpen, setDesmosOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    setDesmosOpen(window.localStorage.getItem(DESMOS_TOGGLE_KEY) === '1');
  }, []);
  const toggleDesmos = useCallback(() => {
    setDesmosOpen((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(DESMOS_TOGGLE_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);
  const desmosVisible = desmosEligible && desmosOpen;

  return (
    <main
      style={{
        ...S.main,
        // Widen the container when the question uses the
        // two-column reading layout; the default 860px cramps both
        // panes.
        maxWidth: question.layout === 'two-column' ? 1280 : S.main.maxWidth,
        // Shift content right when the fixed Desmos panel is open
        // so the question doesn't sit behind it.
        marginLeft: desmosVisible ? 'min(52vw, 720px)' : undefined,
        transition: 'margin-left 180ms ease-out',
      }}
    >
      <header style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.progress}>
            Question {session.position + 1} of {session.total}
          </span>
          {question.taxonomy && (
            <span style={S.meta}>
              {question.taxonomy.domain_name}
              {question.taxonomy.skill_name ? ` · ${question.taxonomy.skill_name}` : ''}
              {question.taxonomy.difficulty ? ` · difficulty ${question.taxonomy.difficulty}` : ''}
            </span>
          )}
        </div>
        <div style={S.headerRight}>
          {desmosEligible && (
            <button
              type="button"
              onClick={toggleDesmos}
              aria-pressed={desmosOpen}
              style={{ ...S.navBtn, ...(desmosOpen ? S.navBtnActive : null) }}
              title="Toggle the Desmos graphing calculator"
            >
              {desmosOpen ? '✕ Calculator' : '📐 Calculator'}
            </button>
          )}
          <button
            type="button"
            onClick={handlePrev}
            disabled={session.position <= 0 || isNavigating}
            style={S.navBtn}
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isNavigating}
            style={S.navBtn}
          >
            Next →
          </button>
        </div>
      </header>

      {desmosEligible && (
        <DesmosPanel
          isOpen={desmosVisible}
          storageKey={`desmos:practice:${question.questionId}`}
        />
      )}

      <form onSubmit={handleSubmit} style={S.article}>
        <QuestionRenderer
          mode="practice"
          layout={question.layout ?? 'single'}
          question={question}
          selectedOptionId={selectedId}
          onSelectOption={setSelectedId}
          responseText={responseText}
          onResponseText={setResponseText}
          result={result}
        />

        {!isReviewed && (
          <Button
            type="submit"
            disabled={submitting || !canSubmit}
            style={{ alignSelf: 'flex-start' }}
          >
            {submitting ? 'Checking…' : 'Submit'}
          </Button>
        )}

        {submitError && (
          <p role="alert" style={S.error}>
            {submitError}
          </p>
        )}

        {isReviewed && (
          <Button
            type="button"
            onClick={handleNext}
            style={{ alignSelf: 'flex-start' }}
          >
            Next question →
          </Button>
        )}
      </form>
    </main>
  );
}

// Session-chrome styles. Question-rendering styles moved to
// lib/ui/QuestionRenderer.js.
const S = {
  main: { maxWidth: 860, margin: '2rem auto', padding: '0 1.5rem', fontFamily: 'system-ui, sans-serif' },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
  },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: '0.125rem' },
  progress: { fontSize: '0.9rem', color: '#6b7280', fontWeight: 600 },
  meta: { fontSize: '0.8rem', color: '#9ca3af' },
  headerRight: { display: 'flex', gap: '0.5rem' },
  navBtn: {
    padding: '0.4rem 0.75rem',
    background: 'white',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: '0.85rem',
    cursor: 'pointer',
    color: '#374151',
  },
  navBtnActive: {
    background: '#eff6ff',
    borderColor: '#2563eb',
    color: '#1e40af',
    fontWeight: 600,
  },
  article: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  error: { color: '#b91c1c', fontSize: '0.9rem', margin: 0 },
};
