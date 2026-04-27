// Floating calculator — a toggle button plus a movable + resizable
// Desmos panel that floats above the page. Unlike the runner's
// left-pane Desmos (which collapses a grid track), this one can
// be dragged anywhere in the viewport and resized from its
// bottom-right corner.
//
// The panel mounts only while open so Desmos doesn't eat memory
// on non-math questions. Desmos' own localStorage persistence
// carries graph state across reopens via the storageKey prop.
//
// Drag interaction. mousedown on the header starts a drag;
// mousemove/mouseup listeners attach to window so the panel keeps
// tracking the cursor even if it escapes the header. Touch
// handlers mirror the mouse flow so the panel is usable on
// tablets.
//
// Resize. CSS `resize: both` gives a native browser grip at the
// bottom-right corner. min-width/height + max-width/height (both
// in CSS) keep it usable without letting it balloon past the
// viewport.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DesmosPanel } from './DesmosPanel';
import { CalculatorIcon } from './icons';
import s from './FloatingCalculator.module.css';

/**
 * @param {object} props
 * @param {string} props.storageKey — Desmos localStorage key.
 * @param {string} [props.buttonClassName]
 * @param {string} [props.label='Calculator']
 * @param {(calc: any|null) => void} [props.onCalcReady] — forwarded
 *   to the inner DesmosPanel; receives the live calculator instance
 *   once it mounts and `null` when the panel closes/unmounts. Used
 *   by DesmosSavedStateButton to wire its Save / Load actions.
 */
export function FloatingCalculator({
  storageKey,
  buttonClassName,
  label = 'Calculator',
  onCalcReady,
}) {
  const [open, setOpen] = useState(false);
  // null means "use the default bottom-right CSS position". After
  // the first drag, flips to { top, left } in pixels — we clear
  // bottom + right via inline style so the panel tracks the drag
  // instead of re-snapping to the corner.
  const [pos, setPos] = useState(null);
  const panelRef = useRef(null);

  // Close on Escape for parity with the runner's popover.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Drag handler. Shared between mouse + touch by extracting the
  // pointer coordinates; both events expose clientX/clientY in
  // the same units.
  const onHeaderPointerDown = useCallback((e) => {
    // Ignore clicks on the close button inside the header.
    if (e.target.closest('button')) return;
    // Ignore secondary buttons — only primary left-click drags.
    if (e.type === 'mousedown' && e.button !== 0) return;
    e.preventDefault();

    const isTouch = e.type.startsWith('touch');
    const startClient = isTouch ? e.touches[0] : e;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const grabOffsetX = startClient.clientX - rect.left;
    const grabOffsetY = startClient.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    function clamp(left, top) {
      const maxLeft = Math.max(0, window.innerWidth  - w);
      const maxTop  = Math.max(0, window.innerHeight - h);
      return {
        left: Math.min(Math.max(left, 0), maxLeft),
        top:  Math.min(Math.max(top,  0), maxTop),
      };
    }

    function onMove(ev) {
      const c = isTouch ? ev.touches[0] : ev;
      if (!c) return;
      setPos(clamp(c.clientX - grabOffsetX, c.clientY - grabOffsetY));
    }
    function onEnd() {
      window.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
      window.removeEventListener(isTouch ? 'touchend'  : 'mouseup',   onEnd);
      window.removeEventListener('touchcancel', onEnd);
    }

    window.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
    window.addEventListener(isTouch ? 'touchend'  : 'mouseup',   onEnd);
    if (isTouch) window.addEventListener('touchcancel', onEnd);
  }, []);

  // Keep the panel inside the viewport if the window shrinks.
  useEffect(() => {
    if (!open || !pos) return undefined;
    function onResize() {
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxLeft = Math.max(0, window.innerWidth  - rect.width);
      const maxTop  = Math.max(0, window.innerHeight - rect.height);
      setPos((p) => (p ? {
        left: Math.min(p.left, maxLeft),
        top:  Math.min(p.top,  maxTop),
      } : p));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, pos]);

  const btnCls = [buttonClassName ?? s.toggleBtn, open ? s.toggleBtnActive : null]
    .filter(Boolean).join(' ');

  // Inline style only when user has dragged — the default is the
  // CSS rule's bottom-right anchor so a freshly-opened panel lands
  // in a predictable spot.
  const panelStyle = pos
    ? { top: `${pos.top}px`, left: `${pos.left}px`, bottom: 'auto', right: 'auto' }
    : null;

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
        <div
          ref={panelRef}
          className={s.panel}
          style={panelStyle}
          role="dialog"
          aria-label="Graphing calculator"
        >
          <div
            className={s.header}
            onMouseDown={onHeaderPointerDown}
            onTouchStart={onHeaderPointerDown}
          >
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
            <DesmosPanel isOpen storageKey={storageKey} onCalcReady={onCalcReady} />
          </div>
        </div>
      )}
    </>
  );
}
