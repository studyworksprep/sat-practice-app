// Reference sheet — a toggle button plus a centered modal that shows
// the SAT Math reference sheet image. Used on every math-question
// surface (live test, practice runner, post-test review, assignment
// report, review session) so the student always has the same set of
// formulas one click away.
//
// The modal is centered, dimmed-backdrop, escape-to-close, click-
// outside-to-close. Unlike FloatingCalculator, the panel is not
// draggable — the reference is a static image, not an interactive
// surface, so a fixed centered position is fine.
//
// Asset: /math_reference_sheet.png in /public.

'use client';

import { useEffect } from 'react';
import { ReferenceIcon } from './icons';
import { ToolButton } from './ToolButton';
import s from './ReferenceSheetButton.module.css';

/**
 * @param {object} props
 * @param {string} [props.buttonClassName] — class applied to the
 *   toggle button. Lets each callsite (top bar, side toolbar, inline
 *   action row) match its surrounding controls.
 * @param {string} [props.label='Reference']
 * @param {boolean} props.open — controlled open state.
 * @param {(next: boolean) => void} props.onOpenChange — controlled
 *   setter. Two-prop control instead of internal state so the
 *   parent can coordinate with sibling popovers (e.g. close the
 *   reference sheet when the calculator opens, if it ever wants to).
 */
export function ReferenceSheetButton({
  buttonClassName,
  label = 'Reference',
  open,
  onOpenChange,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onOpenChange(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  return (
    <>
      <ToolButton
        icon={<ReferenceIcon />}
        label={label}
        active={open}
        onClick={() => onOpenChange(!open)}
        aria-pressed={open}
        title={open ? 'Hide reference sheet' : 'Show reference sheet'}
        className={buttonClassName}
      />
      {open && (
        <div
          className={s.overlay}
          onClick={() => onOpenChange(false)}
          role="dialog"
          aria-modal="true"
          aria-label="SAT Math reference sheet"
        >
          <div className={s.card} onClick={(e) => e.stopPropagation()}>
            <div className={s.header}>
              <strong className={s.title}>SAT Math Reference Sheet</strong>
              <button
                type="button"
                className={s.closeBtn}
                onClick={() => onOpenChange(false)}
                aria-label="Close reference sheet"
              >
                ✕
              </button>
            </div>
            <div className={s.body}>
              <img
                className={s.sheet}
                src="/math_reference_sheet.png"
                alt="SAT Math Reference Sheet"
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
