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
  // Current position is indicated with an accent outline outside
  // the pill rather than by recoloring its fill, so the student
  // can still tell at a glance which questions they got right /
  // wrong even on the active one.
  const style = {
    ...S.pill,
    background: tone.bg,
    color: tone.fg,
    border: `1px solid ${tone.border}`,
    fontWeight: isCurrent ? 700 : 600,
    outline: isCurrent ? `2px solid ${colors.accent}` : 'none',
    outlineOffset: isCurrent ? 2 : 0,
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

import { colors, fonts, radius, shadow, space } from '@/lib/ui/tokens';

// Muted semantic tones — sage/coral/amber from the design kit,
// slate for unanswered/removed. Current position is indicated
// with an outer accent outline per the design kit's .mapItem.active
// rule, keeping the inner fill stable so status stays readable.
const STATUS_TONES = {
  unanswered: { bg: colors.card,           fg: colors.fg1,       border: colors.borderStrong },
  correct:    { bg: 'rgba(91,168,118,0.14)',  fg: '#166534',     border: colors.success },
  incorrect:  { bg: 'rgba(217,119,117,0.14)', fg: '#991b1b',     border: colors.danger },
  removed:    { bg: colors.slate[100],     fg: colors.fg3,       border: colors.border },
};

const S = {
  footerWide: {
    position: 'sticky', bottom: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', gap: space[3],
    padding: `${space[3]} ${space[4]}`,
    background: colors.card,
    borderTop: `1px solid ${colors.border}`,
    boxShadow: '0 -2px 8px rgba(16,42,67,0.04)',
    fontFamily: fonts.sans,
    overflowX: 'auto',
    zIndex: 10,
  },
  footerNarrow: {
    position: 'sticky', bottom: 0, left: 0, right: 0,
    display: 'flex', justifyContent: 'center',
    padding: `${space[3]} ${space[4]}`,
    background: colors.card,
    borderTop: `1px solid ${colors.border}`,
    boxShadow: '0 -2px 8px rgba(16,42,67,0.04)',
    zIndex: 10,
  },
  stripLabel: {
    fontSize: 11, color: colors.fg3, textTransform: 'uppercase',
    letterSpacing: '0.08em', fontWeight: 700, flexShrink: 0,
  },
  mapBtn: {
    display: 'inline-flex', alignItems: 'center', gap: space[2],
    padding: `${space[2]} ${space[4]}`,
    background: colors.slate[50],
    color: colors.fg1,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.pill,
    fontWeight: 700, fontSize: 13, cursor: 'pointer',
    fontFamily: fonts.sans,
  },
  grid: {
    display: 'flex', flexWrap: 'wrap', gap: space[1],
    alignItems: 'center',
  },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    minWidth: 32, padding: `${space[1]} ${space[2]}`,
    borderRadius: radius.md,
    fontSize: 12, fontWeight: 600,
    textDecoration: 'none',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    fontFamily: fonts.sans,
    transition: 'transform 120ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 120ms',
  },
  statusMark: { fontSize: 11, opacity: 0.85 },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(16,42,67,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: space[4],
  },
  modal: {
    background: colors.card,
    borderRadius: radius.xl,
    padding: space[4],
    maxWidth: 520, width: '100%', maxHeight: '80vh', overflowY: 'auto',
    boxShadow: shadow.lg,
    fontFamily: fonts.sans,
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: space[3],
    color: colors.fg1,
  },
  closeBtn: {
    padding: `${space[1]} ${space[3]}`,
    background: colors.card,
    color: colors.fg1,
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: radius.md,
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};
