// Question-navigator popover for the practice-test runner.
// Renders the current module's question grid (current pin /
// answered / unanswered / for-review pills), a small legend, and
// a "Go to Review Page" button. Closes on outside click or
// Escape, with a one-tick deferral on the click handler so the
// click that opened the popover doesn't immediately close it.
//
// Lives next to TestRunnerInteractive but extracted so the
// runner stays focused on state + grading. Shares
// TestRunner.module.css.

'use client';

import { useEffect, useRef } from 'react';
import { BookmarkIcon } from '@/lib/ui/icons';
import s from './TestRunner.module.css';

export function NavPopover({
  open,
  onClose,
  moduleLabel,
  navItems,
  currentPosition,
  onJump,
  onReview,
}) {
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
          <span className={s.legendCurrentPin} aria-hidden="true" />
          Current
        </span>
        <span className={s.legendItem}>
          <span className={`${s.legendSwatch} ${s.swatchUnanswered}`} aria-hidden="true" />
          Unanswered
        </span>
        <span className={s.legendItem}>
          <BookmarkIcon filled size={14} className={s.legendFlag} />
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
              {isCurrent && <span className={s.bubblePin} aria-hidden="true" />}
              <span className={s.bubbleNum}>{it.position + 1}</span>
              {it.marked && (
                <BookmarkIcon filled size={12} className={s.bubbleFlag} />
              )}
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
