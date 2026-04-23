// Floating calculator — a toggle button plus a fixed-position
// Desmos panel that opens in the bottom-right corner. Unlike the
// runner's left-pane Desmos (which collapses a grid track), this
// one floats above the content so review pages — where the
// question body already fills the width — can still offer a
// scratch calculator on math items.
//
// The panel mounts only while open so Desmos doesn't eat memory
// on non-math questions. When closed, state is persisted via
// DesmosPanel's own localStorage serialization so the graph
// carries across reopens of the same storageKey.

'use client';

import { useEffect, useState } from 'react';
import { DesmosPanel } from './DesmosPanel';
import { CalculatorIcon } from './icons';
import s from './FloatingCalculator.module.css';

/**
 * @param {object} props
 * @param {string} props.storageKey — Desmos serializes its state
 *   under this key in localStorage. Typically scoped per review
 *   surface (e.g. `desmos:review:session:<id>`).
 * @param {string} [props.buttonClassName] — caller can override
 *   the trigger button's styling to match its host (e.g. the
 *   question header on the review page).
 * @param {string} [props.label='Calculator'] — button text.
 */
export function FloatingCalculator({
  storageKey,
  buttonClassName,
  label = 'Calculator',
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape for parity with the runner's popover.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const btnCls = [buttonClassName ?? s.toggleBtn, open ? s.toggleBtnActive : null]
    .filter(Boolean).join(' ');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnCls}
        aria-pressed={open}
        title={open ? 'Hide calculator' : 'Show calculator'}
      >
        <CalculatorIcon />
        {label}
      </button>
      {open && (
        <div className={s.panel} role="dialog" aria-label="Graphing calculator">
          <div className={s.header}>
            <strong className={s.title}>Calculator</strong>
            <button
              type="button"
              className={s.closeBtn}
              onClick={() => setOpen(false)}
              aria-label="Close calculator"
            >
              ✕
            </button>
          </div>
          <div className={s.body}>
            <DesmosPanel isOpen storageKey={storageKey} />
          </div>
        </div>
      )}
    </>
  );
}
