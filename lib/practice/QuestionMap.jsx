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

import { useState } from 'react';
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
 */
export function QuestionMap({ basePath, sessionId, currentPosition, items }) {
  const [modalOpen, setModalOpen] = useState(false);

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

  return (
    <>
      <nav aria-label="Question navigation" className={s.footerWide}>
        <span className={s.stripLabel}>Questions</span>
        {grid}
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
