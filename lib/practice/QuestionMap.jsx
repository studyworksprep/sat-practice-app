'use client';

// Question-navigation strip for a practice session. Renders one
// pill per position (1..total) with color / icon reflecting
// status, highlights current position, and links each pill to
// the corresponding session URL.
//
// Responsive: on wide viewports it sits as a persistent footer
// strip; on narrow screens it collapses behind a "Map" button
// that opens the same grid in a modal. Status vocabulary is
// intentionally small — unanswered / correct / incorrect /
// removed / current — so a tiny pill stays readable.
//
// Status data is supplied by the server (pre-computed from
// attempts rows) rather than fetched client-side, so the strip
// renders server-side and stays in sync with the reveal state
// the student sees.

import { useEffect, useState } from 'react';

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
  const [narrow, setNarrow] = useState(false);

  // Detect narrow viewport to decide whether to show the full
  // strip or the collapsed "Map" button. 720px is the same
  // breakpoint used elsewhere in the tutor pages.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const grid = (
    <div style={S.grid} role="list">
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
      {narrow ? (
        <div style={S.footerNarrow}>
          <button type="button" onClick={() => setModalOpen(true)} style={S.mapBtn}>
            Map ({currentPosition + 1}/{items.length})
          </button>
        </div>
      ) : (
        <nav aria-label="Question navigation" style={S.footerWide}>
          <span style={S.stripLabel}>Questions</span>
          {grid}
        </nav>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Question navigation"
          style={S.overlay}
          onClick={() => setModalOpen(false)}
        >
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <header style={S.modalHeader}>
              <strong>Questions</strong>
              <button type="button" onClick={() => setModalOpen(false)} style={S.closeBtn}>
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
  const tone = STATUS_TONES[item.status] ?? STATUS_TONES.unanswered;
  const style = {
    ...S.pill,
    background: isCurrent ? tone.currentBg : tone.bg,
    color: isCurrent ? tone.currentFg : tone.fg,
    border: isCurrent ? `2px solid ${tone.currentBorder}` : `1px solid ${tone.border}`,
    fontWeight: isCurrent ? 700 : 500,
  };
  return (
    <a role="listitem" href={href} style={style} aria-current={isCurrent ? 'step' : undefined}>
      <span>{item.position + 1}</span>
      {item.status === 'correct'   && <span style={S.statusMark} aria-label="correct">✓</span>}
      {item.status === 'incorrect' && <span style={S.statusMark} aria-label="incorrect">✗</span>}
      {item.status === 'removed'   && <span style={S.statusMark} aria-label="removed">—</span>}
    </a>
  );
}

// ──────────────────────────────────────────────────────────────

const STATUS_TONES = {
  unanswered: { bg: 'white',   fg: '#374151', border: '#d1d5db', currentBg: '#eff6ff', currentFg: '#1e40af', currentBorder: '#2563eb' },
  correct:    { bg: '#dcfce7', fg: '#166534', border: '#86efac', currentBg: '#bbf7d0', currentFg: '#14532d', currentBorder: '#16a34a' },
  incorrect:  { bg: '#fee2e2', fg: '#991b1b', border: '#fca5a5', currentBg: '#fecaca', currentFg: '#7f1d1d', currentBorder: '#dc2626' },
  removed:    { bg: '#f3f4f6', fg: '#9ca3af', border: '#e5e7eb', currentBg: '#e5e7eb', currentFg: '#6b7280', currentBorder: '#9ca3af' },
};

const S = {
  footerWide: {
    position: 'sticky', bottom: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', gap: '0.75rem',
    padding: '0.625rem 1rem',
    background: 'white',
    borderTop: '1px solid #e5e7eb',
    boxShadow: '0 -2px 8px rgba(0,0,0,0.03)',
    fontFamily: 'system-ui, sans-serif',
    overflowX: 'auto',
    zIndex: 10,
  },
  footerNarrow: {
    position: 'sticky', bottom: 0, left: 0, right: 0,
    display: 'flex', justifyContent: 'center',
    padding: '0.625rem 1rem',
    background: 'white',
    borderTop: '1px solid #e5e7eb',
    boxShadow: '0 -2px 8px rgba(0,0,0,0.03)',
    zIndex: 10,
  },
  stripLabel: { fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, flexShrink: 0 },
  mapBtn: {
    padding: '0.4rem 1rem',
    background: '#2563eb', color: 'white',
    border: 'none', borderRadius: 6,
    fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
  },
  grid: {
    display: 'flex', flexWrap: 'wrap', gap: '0.25rem',
    alignItems: 'center',
  },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
    minWidth: '2rem', padding: '0.2rem 0.45rem',
    borderRadius: 6,
    fontSize: '0.85rem',
    textDecoration: 'none',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  statusMark: { fontSize: '0.75rem', opacity: 0.85 },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: '1rem',
  },
  modal: {
    background: 'white', borderRadius: 10, padding: '1rem',
    maxWidth: 480, width: '100%', maxHeight: '80vh', overflowY: 'auto',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '0.75rem',
  },
  closeBtn: {
    padding: '0.25rem 0.625rem',
    background: 'white', color: '#374151',
    border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: '0.85rem', cursor: 'pointer',
  },
};
