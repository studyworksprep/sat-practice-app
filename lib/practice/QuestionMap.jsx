'use client';

// Question-navigation strip for a practice session. Renders one
// pill per position (1..total) with color / icon reflecting
// status, highlights current position, and links each pill to
// the corresponding session URL.
//
// Responsive: on wide viewports the footer strip is visible and
// the collapsed "Map" button is hidden; on narrow viewports it
// flips. The switch happens in CSS (@media) rather than JS, so
// the server HTML is already correct for both shapes and there's
// no post-hydration flicker.
//
// Status data is supplied by the server (pre-computed from
// attempts rows) rather than fetched client-side, so the strip
// renders server-side and stays in sync with the reveal state
// the student sees.
//
// Submit Set. The strip ends with a primary "Submit Set" button
// that closes out the session (even mid-set, leaving unanswered
// questions marked Unanswered on the review report). The server
// action is idempotent so a double-click is safe.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitPracticeSession } from './session-actions';
import s from './QuestionMap.module.css';

/**
 * @param {object} props
 * @param {string} props.basePath             — e.g. "/practice" or "/review"
 * @param {string} props.sessionId
 * @param {number} props.currentPosition      — 0-indexed
 * @param {Array<{
 *   position: number,
 *   status: 'unanswered' | 'correct' | 'incorrect' | 'removed'
 * }>} props.items
 * @param {boolean} [props.canSubmit=true] — hide the Submit button
 *   when the page doesn't own the session (review mode), etc.
 */
export function QuestionMap({ basePath, sessionId, currentPosition, items, canSubmit = true }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState(null);

  function handleSubmitSet() {
    setSubmitError(null);
    const ok = typeof window !== 'undefined'
      ? window.confirm('Submit this set? Any unanswered questions will be marked as skipped.')
      : true;
    if (!ok) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set('sessionId', sessionId);
      try {
        const res = await submitPracticeSession(null, fd);
        if (!res?.ok) {
          setSubmitError(res?.error ?? 'Could not submit');
          return;
        }
        router.push(`/practice/review/${sessionId}`);
      } catch (err) {
        setSubmitError(err.message ?? String(err));
      }
    });
  }

  const grid = (
    <div className={s.grid} role="list">
      {items.map((it) => (
        <Pill
          key={it.position}
          item={it}
          isCurrent={it.position === currentPosition}
          href={`${basePath}/s/${sessionId}/${it.position}`}
        />
      ))}
    </div>
  );

  const submitBtn = canSubmit ? (
    <button
      type="button"
      onClick={handleSubmitSet}
      disabled={isPending}
      className={s.submitBtn}
      title="Submit this set and see the report"
    >
      {isPending ? 'Submitting…' : 'Submit Set'}
    </button>
  ) : null;

  return (
    <>
      <nav aria-label="Question navigation" className={s.footerWide}>
        <div className={s.footerInner}>
          <span className={s.stripLabel}>Questions</span>
          {grid}
          {submitBtn}
        </div>
        {submitError && <div className={s.submitError} role="alert">{submitError}</div>}
      </nav>

      <div className={s.footerNarrow}>
        <button type="button" onClick={() => setModalOpen(true)} className={s.mapBtn}>
          Map ({currentPosition + 1}/{items.length})
        </button>
        {submitBtn}
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Question navigation"
          className={s.overlay}
          onClick={() => setModalOpen(false)}
        >
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <header className={s.modalHeader}>
              <strong>Questions</strong>
              <button type="button" onClick={() => setModalOpen(false)} className={s.closeBtn}>
                Close
              </button>
            </header>
            {grid}
            {submitBtn && <div className={s.modalSubmit}>{submitBtn}</div>}
          </div>
        </div>
      )}
    </>
  );
}

function Pill({ item, isCurrent, href }) {
  const pillClass = [
    s.pill,
    item.status === 'correct'   ? s.pillCorrect   : null,
    item.status === 'incorrect' ? s.pillIncorrect : null,
    item.status === 'removed'   ? s.pillRemoved   : null,
    isCurrent                    ? s.pillCurrent   : null,
  ].filter(Boolean).join(' ');
  return (
    <a
      role="listitem"
      href={href}
      className={pillClass}
      aria-current={isCurrent ? 'step' : undefined}
    >
      <span>{item.position + 1}</span>
      {item.status === 'correct'   && <span className={s.statusMark} aria-label="correct">✓</span>}
      {item.status === 'incorrect' && <span className={s.statusMark} aria-label="incorrect">✗</span>}
      {item.status === 'removed'   && <span className={s.statusMark} aria-label="removed">—</span>}
    </a>
  );
}
