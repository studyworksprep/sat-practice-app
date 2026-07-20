'use client';

// Desmos Graphing Calculator panel, ported from legacy
// app/act-practice/[questionId]/page.js for use inside the new
// tree's practice / training flows.
//
// Visibility: the panel is always rendered once the Desmos script
// is loaded (hiding would destroy and recreate the calculator on
// every toggle, which is slow and loses state). The `isOpen` prop
// controls whether it's visible; when closed we push it off-screen
// with CSS rather than unmount.
//
// State persistence: Desmos's serialized state is saved to
// localStorage keyed by `storageKey`, debounced to once per few
// seconds of idle. On open we restore whatever's saved.
//
// Optionally, parents can pass `onCalcReady(calc)` to receive the
// live Desmos instance once it's constructed; the
// DesmosSavedStateButton uses this to wire its Save / Load /
// Delete actions into the calculator without touching its host
// element. The callback is invoked once on mount and again with
// `null` on unmount so callers can drop their reference.
//
// The calculator's script tag is injected globally from
// app/layout.js so the window.Desmos constructor is available
// here. We don't load it again.
//
// Sizing: by default the panel carries a 640px min-height floor so
// it stays usable when it drives a grid track that would otherwise
// collapse (the QuestionRenderer left-pane case). Pass
// `fitToContainer` when the host already has its own bounded height
// — e.g. FloatingCalculator's fixed-size, overflow:hidden body —
// so the calculator sizes to the container instead of overflowing
// it. Without this, the 640px floor pushes the calculator taller
// than the visible area and the host clips the bottom, which is
// exactly where Desmos anchors the on-screen keypad + its toggle,
// so the keypad appears to never pop up.

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import s from './DesmosPanel.module.css';
import { DESMOS_API_KEY, desmosCalculatorSrc } from '../config/desmos';

const SAVE_DEBOUNCE_MS = 2000;
const LOAD_TIMEOUT_MS = 10000;

/**
 * @param {{
 *   isOpen: boolean,
 *   storageKey?: string,
 *   onCalcReady?: (calculator: any | null) => void,
 *   fitToContainer?: boolean,
 *   initialState?: any,
 *   initialExpressions?: any[],
 *   calculatorOptions?: Record<string, any>
 * }} props
 */
export function DesmosPanel({
  isOpen,
  storageKey,
  onCalcReady,
  fitToContainer = false,
  initialState = null,
  initialExpressions = [],
  calculatorOptions = {},
}) {
  const hostRef     = useRef(null);
  const calcRef     = useRef(null);
  const saveTimer   = useRef(null);
  const rafRef      = useRef(null);
  const onReadyRef  = useRef(onCalcReady);
  const activeStorageKeyRef = useRef(storageKey || null);
  const seedRef = useRef({ initialState, initialExpressions });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(
    DESMOS_API_KEY ? null : 'missing-key',
  );

  // Keep the callback ref fresh without forcing the init effect
  // to re-run on every parent rerender.
  useEffect(() => { onReadyRef.current = onCalcReady; }, [onCalcReady]);
  useEffect(() => {
    seedRef.current = { initialState, initialExpressions };
  }, [initialState, initialExpressions]);

  // If Desmos was loaded in an earlier page (via the global script
  // tag in app/layout.js), the constructor is already on window.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Desmos) {
      setReady(true);
      setLoadError(null);
    }
  }, []);

  // Do not leave an unexplained blank panel when the external script is
  // blocked, misconfigured, or unavailable. A timeout also catches cases
  // where the global layout script fails before this component's Script
  // callback can report an error.
  useEffect(() => {
    if (ready || !DESMOS_API_KEY) return undefined;
    const timer = setTimeout(() => setLoadError('load-failed'), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  // Init the calculator once the script is ready. Recreated only
  // if the storageKey changes (e.g. student navigated to a new
  // question).
  useEffect(() => {
    if (!ready || !hostRef.current || !window.Desmos) return;
    if (calcRef.current) return;  // already initialized

    calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
      autosize: true, keypad: true, expressions: true, settingsMenu: true,
      zoomButtons: true, forceEnableGeometryFunctions: true,
      images: false, folders: false, notes: false, links: false,
      restrictedFunctions: false,
    });

    activeStorageKeyRef.current = storageKey || null;
    restoreOrSeed(activeStorageKeyRef.current);
    scheduleResize();
    // Observe changes → debounced save.
    calcRef.current.observeEvent?.('change', () => scheduleSave());
    onReadyRef.current?.(calcRef.current);

    return () => {
      // Save one last time on unmount.
      try { saveToLocalStorage(); } catch {}
      try { onReadyRef.current?.(null); } catch {}
      try { calcRef.current?.destroy?.(); } catch {}
      calcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Save the outgoing calculator scope before loading the incoming
  // block/workflow scope. The active-key ref prevents a pending save
  // from writing stale state under the newly-rendered key.
  useEffect(() => {
    if (!calcRef.current) return;
    const nextKey = storageKey || null;
    const previousKey = activeStorageKeyRef.current;
    if (nextKey === previousKey) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saveToLocalStorage(previousKey);
    activeStorageKeyRef.current = nextKey;
    restoreOrSeed(nextKey);
    scheduleResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!calcRef.current) return;
    try {
      calcRef.current.updateSettings?.({
        expressions: calculatorOptions.expressions ?? true,
        lockViewport: calculatorOptions.lockViewport ?? false,
        sliders: calculatorOptions.sliders ?? true,
        keypad: calculatorOptions.expressions ?? true,
        zoomButtons: calculatorOptions.lockViewport !== true,
      });
      scheduleResize();
    } catch {}
  }, [ready, calculatorOptions.expressions, calculatorOptions.lockViewport, calculatorOptions.sliders]);

  // When the panel visibility changes, ask Desmos to resize so
  // layout is correct after the container dimensions change.
  useEffect(() => {
    if (!isOpen || !calcRef.current) return;
    scheduleResize();
  }, [isOpen]);

  // Desmos can initialize while a persistent panel is hidden. In that case
  // its host measures 0 x 0 and a one-off resize on the React visibility
  // change can still run before CSS grid has assigned the newly-open pane a
  // real width. Observe the host itself so hidden-to-visible transitions,
  // responsive grid changes, sidebars, and draggable panel resizing all
  // resize the calculator after layout settles.
  useEffect(() => {
    const host = hostRef.current;
    if (!ready || !host || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      scheduleResize();
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [ready]);

  function scheduleResize() {
    if (!calcRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      try { calcRef.current.resize(); } catch {}
    });
  }

  function saveToLocalStorage(key = activeStorageKeyRef.current) {
    if (!calcRef.current || !key) return;
    try {
      const st = calcRef.current.getState();
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(st));
      }
    } catch {}
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveToLocalStorage, SAVE_DEBOUNCE_MS);
  }

  function applySeed() {
    if (!calcRef.current) return;
    const seed = seedRef.current || {};
    try {
      if (seed.initialState && typeof seed.initialState === 'object') {
        calcRef.current.setState(seed.initialState, { allowUndo: false });
      } else {
        calcRef.current.setBlank?.({ allowUndo: false });
        const expressions = Array.isArray(seed.initialExpressions)
          ? seed.initialExpressions.filter((expr) => expr?.latex)
          : [];
        if (expressions.length > 0) calcRef.current.setExpressions?.(expressions);
      }
      const defaultState = calcRef.current.getState?.();
      if (defaultState) calcRef.current.setDefaultState?.(defaultState);
      calcRef.current.clearHistory?.();
    } catch {}
  }

  function restoreOrSeed(key = activeStorageKeyRef.current) {
    if (!calcRef.current) return;
    try {
      if (typeof window === 'undefined' || !window.localStorage || !key) {
        applySeed();
        return;
      }
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        applySeed();
        return;
      }
      const st = JSON.parse(raw);
      calcRef.current.setState(st, { allowUndo: false });
      calcRef.current.setDefaultState?.(seedRef.current?.initialState || st);
      calcRef.current.clearHistory?.();
    } catch {
      applySeed();
    }
  }

  return (
    <>
      <Script
        src={desmosCalculatorSrc()}
        strategy="afterInteractive"
        onLoad={() => {
          if (!DESMOS_API_KEY) {
            setLoadError('missing-key');
            return;
          }
          if (typeof window !== 'undefined' && window.Desmos) {
            setReady(true);
            setLoadError(null);
          } else {
            setLoadError('load-failed');
          }
        }}
        onError={() => setLoadError(DESMOS_API_KEY ? 'load-failed' : 'missing-key')}
      />
      <aside
        aria-label="Graphing calculator"
        aria-hidden={!isOpen}
        className={`${s.panel} ${fitToContainer ? s.panelFit : ''}`}
      >
        {!ready && (
          <div className={s.status} role="status">
            <strong className={s.statusTitle}>
              {loadError ? 'Graphing calculator unavailable' : 'Loading graphing calculator…'}
            </strong>
            {loadError === 'missing-key' && (
              <p className={s.statusText}>
                This environment is missing its Desmos API key. Configure{' '}
                <code>NEXT_PUBLIC_DESMOS_API_KEY</code> and restart or redeploy the app.
              </p>
            )}
            {loadError === 'load-failed' && (
              <p className={s.statusText}>
                The Desmos script did not load. Check the configured API key, its allowed
                domains, and network access to desmos.com.
              </p>
            )}
          </div>
        )}
        <div ref={hostRef} className={s.host} />
      </aside>
    </>
  );
}
