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
// Finish. The strip ends with a "Finish" pill that closes out
// the session (even mid-set, leaving unanswered questions marked
// Unanswered on the review report). The pill lives inline at
// the end of the question cells — visually the "last step after
// the questions" — rather than flush-right at the bottom of the
// strip, so it can't be confused with the per-question Submit
// button on the question card. The server action is idempotent
// so a double-click is safe.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitPracticeSession } from './session-actions';
import { domainSection } from '@/lib/ui/question-layout';
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
 * @param {(position: number) => void} [props.onJump] — when supplied,
 *   pill clicks call this instead of doing a route change. Used by
 *   the in-runner client-state navigation; falls back to <a href> for
 *   any caller (e.g. the soft "removed" page render) that doesn't
 *   have an in-page state machine to drive.
 */
export function QuestionMap({ basePath, sessionId, currentPosition, items, canSubmit = true, onJump }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState(null);

  function handleSubmitSet() {
    setSubmitError(null);
    const ok = typeof window !== 'undefined'
      ? window.confirm('Finish this set? Any unanswered questions will be marked as skipped.')
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
        // Mirror the runner's URL prefix so a tutor training set
        // closes out into /tutor/training/practice/review/...
        // instead of bouncing through the (student) tree.
        router.push(`${basePath}/review/${sessionId}`);
      } catch (err) {
        setSubmitError(err.message ?? String(err));
      }
    });
  }

  const handlePillClick = onJump
    ? (e, position) => {
        // Close the modal (if open) before the runner re-renders
        // the new question.
        e.preventDefault();
        setModalOpen(false);
        onJump(position);
      }
    : null;

  // Live counts feed the strip header. "Answered" includes
  // correct + incorrect (the student has submitted); "Remaining"
  // is everything else (unanswered + removed).
  const answeredCount = items.filter(
    (it) => it.status === 'correct' || it.status === 'incorrect',
  ).length;
  const remainingCount = items.length - answeredCount;

  const finishPill = canSubmit ? (
    <button
      type="button"
      onClick={handleSubmitSet}
      disabled={isPending}
      className={s.finishPill}
      title="Finish this set and see the report"
    >
      {isPending ? 'Finishing…' : 'Finish'}
    </button>
  ) : null;

  const grid = (
    <div className={s.track} role="list">
      {items.map((it) => (
        <Cell
          key={it.position}
          item={it}
          isCurrent={it.position === currentPosition}
          href={`${basePath}/s/${sessionId}/${it.position}`}
          onClick={handlePillClick ? (e) => handlePillClick(e, it.position) : undefined}
        />
      ))}
      {finishPill}
    </div>
  );

  const stripHeader = (
    <div className={s.stripHeader}>
      <div className={s.stripTitle}>
        <span className={s.stripEyebrow}>Question navigator</span>
        <span className={s.stripCount}>
          {answeredCount} answered · {remainingCount} remaining
        </span>
      </div>
      <div className={s.stripLegend}>
        <span className={s.legendItem}>
          <span className={`${s.legendDot} ${s.legendCurrent}`} />
          Current
        </span>
        <span className={s.legendItem}>
          <span className={`${s.legendDot} ${s.legendCorrect}`} />
          Correct
        </span>
        <span className={s.legendItem}>
          <span className={`${s.legendDot} ${s.legendIncorrect}`} />
          Incorrect
        </span>
        <span className={s.legendItem}>
          <span className={`${s.legendDot} ${s.legendUnanswered}`} />
          Unanswered
        </span>
      </div>
    </div>
  );

  return (
    <>
      <nav aria-label="Question navigation" className={s.footerWide}>
        {stripHeader}
        {grid}
        {submitError && <div className={s.submitError} role="alert">{submitError}</div>}
      </nav>

      <div className={s.footerNarrow}>
        <button type="button" onClick={() => setModalOpen(true)} className={s.mapBtn}>
          Map ({currentPosition + 1}/{items.length})
        </button>
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
          </div>
        </div>
      )}
    </>
  );
}

function Cell({ item, isCurrent, href, onClick }) {
  // Status drives the cell's tone. `current` overrides everything —
  // navy fill + the "you are here" arrow underneath the cell.
  const statusClass =
    item.status === 'correct'   ? s.cellCorrect   :
    item.status === 'incorrect' ? s.cellIncorrect :
    item.status === 'removed'   ? s.cellRemoved   :
    s.cellUnanswered;
  const cellClass = [
    s.cell,
    statusClass,
    isCurrent ? s.cellCurrent : null,
  ].filter(Boolean).join(' ');
  // Subject (RW / Math) tints unanswered cells via [data-subject];
  // current + correct + incorrect override it visually but the
  // attribute stays on the element so a hover or focus ring can
  // still pick up the subject color if needed.
  const subject = item.domainCode ? domainSection(item.domainCode) : null;
  return (
    <a
      role="listitem"
      href={href}
      onClick={onClick}
      className={cellClass}
      data-subject={subject ?? undefined}
      aria-current={isCurrent ? 'step' : undefined}
      aria-label={item.marked
        ? `Question ${item.position + 1}, marked for review`
        : undefined}
    >
      <span className={s.cellNum}>{item.position + 1}</span>
      {item.marked && <span className={s.cellFlag} aria-hidden="true" />}
      {isCurrent && <span className={s.currentArrow} aria-hidden="true" />}
    </a>
  );
}
