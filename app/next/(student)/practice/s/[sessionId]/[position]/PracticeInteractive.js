// Practice session client island. Receives the fully-rendered
// question content as HTML strings (server-rendered, watermarked) and
// handles option selection, submission, and navigation.
//
// Key design notes per docs/architecture-plan.md §3.7:
//   - We never fetch data from the server outside of Server Action
//     invocations. No useEffect + fetch pattern anywhere.
//   - The question HTML strings are server-rendered and passed as
//     props. We insert them via dangerouslySetInnerHTML — which is
//     safe because the strings come from our own questions table and
//     go through applyWatermark() server-side.
//   - The correct answer and rationale are NOT in the initial props.
//     They arrive only from the submitAnswer action result, after the
//     server has verified the attempt row exists.

'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function PracticeInteractive({
  question,
  session,
  initialAttempt,
  submitAnswerAction,
}) {
  const router = useRouter();
  const [pendingTransition, startTransition] = useTransition();

  const isSpr = question.questionType === 'spr';

  // Local UI state for the in-flight answer. MCQ uses selectedId,
  // SPR uses responseText. Once the student submits, we flip
  // `result` and lock the input.
  const [selectedId, setSelectedId] = useState(initialAttempt?.selectedOptionId ?? null);
  const [responseText, setResponseText] = useState(initialAttempt?.responseText ?? '');
  const [result, setResult] = useState(
    initialAttempt
      ? {
          isCorrect: initialAttempt.isCorrect,
          questionType: question.questionType,
          correctOptionId: null,    // not known until submit reveals it
          correctAnswerDisplay: null, // ditto (SPR)
          rationaleHtml: null,       // ditto
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
          isSpr
            ? 'Please enter an answer first.'
            : 'Please select an option first.',
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
            questionType: res.data.questionType,
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
      // Client-side route push — cheap, uses the app's prefetch. The
      // Server Action for goToPosition is kept available for
      // programmatic navigation (e.g. keyboard shortcuts in a later
      // commit) but simple prev/next uses plain router.push.
      const nextPosition = session.position + 1;
      if (nextPosition >= session.total) {
        router.push('/dashboard?session_complete=1');
      } else {
        router.push(`/practice/s/${session.sessionId}/${nextPosition}`);
      }
    });
  }, [router, session.sessionId, session.position, session.total]);

  const handlePrev = useCallback(() => {
    if (session.position <= 0) return;
    startTransition(() => {
      router.push(`/practice/s/${session.sessionId}/${session.position - 1}`);
    });
  }, [router, session.sessionId, session.position]);

  const isNavigating = pendingTransition;

  return (
    <main style={S.main}>
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

      <article style={S.article}>
        {question.stimulusHtml && (
          <section
            style={S.stimulus}
            dangerouslySetInnerHTML={{ __html: question.stimulusHtml }}
          />
        )}
        <section
          style={S.stem}
          dangerouslySetInnerHTML={{ __html: question.stemHtml }}
        />

        <form onSubmit={handleSubmit} style={S.form}>
          {isSpr ? (
            <div style={S.sprWrap}>
              <label htmlFor="spr-input" style={S.sprLabel}>
                Your answer
              </label>
              <input
                id="spr-input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                value={responseText}
                onChange={(e) => !isReviewed && setResponseText(e.target.value)}
                disabled={isReviewed}
                placeholder="Type your answer"
                style={{
                  ...S.sprInput,
                  ...(isReviewed && result?.isCorrect ? S.sprInputCorrect : null),
                  ...(isReviewed && !result?.isCorrect ? S.sprInputWrong : null),
                }}
              />
              <p style={S.sprHint}>
                Enter a number or fraction (e.g. <code>12.5</code> or{' '}
                <code>25/2</code>). Don&apos;t include units.
              </p>
            </div>
          ) : (
            <fieldset style={S.optionsFieldset}>
              <legend style={S.srOnly}>Answer choices</legend>
              {question.options.map((opt) => {
                const selected = selectedId === opt.id;
                const isCorrect =
                  result?.correctOptionId != null && opt.id === result.correctOptionId;
                const isWrongSelection = isReviewed && selected && !isCorrect && result?.correctOptionId != null;
                return (
                  <label
                    key={opt.id}
                    style={{
                      ...S.option,
                      ...(selected ? S.optionSelected : null),
                      ...(isCorrect ? S.optionCorrect : null),
                      ...(isWrongSelection ? S.optionWrong : null),
                    }}
                  >
                    <input
                      type="radio"
                      name={`q-${question.questionId}`}
                      value={opt.id}
                      checked={selected}
                      onChange={() => !isReviewed && setSelectedId(opt.id)}
                      disabled={isReviewed}
                      style={S.radio}
                    />
                    <span style={S.optionLabel}>{opt.label ?? ''}</span>
                    <span
                      style={S.optionContent}
                      dangerouslySetInnerHTML={{ __html: opt.content_html }}
                    />
                  </label>
                );
              })}
            </fieldset>
          )}

          {!isReviewed && (
            <button type="submit" disabled={submitting || !canSubmit} style={S.submitBtn}>
              {submitting ? 'Checking…' : 'Submit'}
            </button>
          )}

          {submitError && (
            <p role="alert" style={S.error}>
              {submitError}
            </p>
          )}
        </form>

        {isReviewed && result && (
          <section style={S.result}>
            <div
              style={{
                ...S.resultBadge,
                background: result.isCorrect ? '#dcfce7' : '#fee2e2',
                color: result.isCorrect ? '#166534' : '#991b1b',
              }}
            >
              {result.isCorrect ? 'Correct' : 'Incorrect'}
            </div>
            {isSpr && result.correctAnswerDisplay && !result.isCorrect && (
              <p style={S.correctAnswer}>
                The correct answer was: <strong>{result.correctAnswerDisplay}</strong>
              </p>
            )}
            {result.rationaleHtml && (
              <div
                style={S.rationale}
                dangerouslySetInnerHTML={{ __html: result.rationaleHtml }}
              />
            )}
            <button type="button" onClick={handleNext} style={S.nextBtn}>
              Next question →
            </button>
          </section>
        )}
      </article>
    </main>
  );
}

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
  article: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  stimulus: {
    padding: '1rem',
    background: '#f9fafb',
    borderRadius: 8,
    lineHeight: 1.6,
    fontSize: '1rem',
  },
  stem: { fontSize: '1.05rem', lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  optionsFieldset: { border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  option: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    cursor: 'pointer',
    background: 'white',
  },
  optionSelected: { borderColor: '#2563eb', background: '#eff6ff' },
  optionCorrect: { borderColor: '#16a34a', background: '#dcfce7' },
  optionWrong: { borderColor: '#dc2626', background: '#fee2e2' },
  sprWrap: { display: 'flex', flexDirection: 'column', gap: '0.375rem' },
  sprLabel: { fontWeight: 600, color: '#374151', fontSize: '0.95rem' },
  sprInput: {
    padding: '0.625rem 0.875rem',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: '1rem',
    maxWidth: 240,
    fontFamily: 'monospace',
  },
  sprInputCorrect: { borderColor: '#16a34a', background: '#dcfce7' },
  sprInputWrong: { borderColor: '#dc2626', background: '#fee2e2' },
  sprHint: { color: '#6b7280', fontSize: '0.85rem', margin: 0 },
  correctAnswer: {
    margin: 0,
    padding: '0.625rem 0.875rem',
    background: '#fef3c7',
    border: '1px solid #fde68a',
    borderRadius: 6,
    fontSize: '0.95rem',
    color: '#92400e',
  },
  radio: { marginTop: '0.25rem' },
  optionLabel: { fontWeight: 600, color: '#374151', minWidth: '1.5rem' },
  optionContent: { flex: 1, lineHeight: 1.5 },
  submitBtn: {
    alignSelf: 'flex-start',
    padding: '0.6rem 1.5rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: '#b91c1c', fontSize: '0.9rem', margin: 0 },
  result: {
    marginTop: '1rem',
    padding: '1rem',
    background: '#f9fafb',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  resultBadge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: 999,
    fontSize: '0.85rem',
    fontWeight: 700,
    alignSelf: 'flex-start',
  },
  rationale: { lineHeight: 1.6, fontSize: '0.95rem', color: '#374151' },
  nextBtn: {
    alignSelf: 'flex-start',
    padding: '0.5rem 1.25rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
