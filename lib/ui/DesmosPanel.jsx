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
// seconds of idle. On open we restore whatever's saved. Server-
// backed persistence (to the existing desmos_saved_states table)
// is a follow-up — localStorage already keeps state within the
// browser across question navigations.
//
// The calculator's script tag is injected globally from
// app/layout.js so the window.Desmos constructor is available
// here. We don't load it again.

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import s from './DesmosPanel.module.css';

const DESMOS_API_KEY =
  process.env.NEXT_PUBLIC_DESMOS_API_KEY ||
  'bac289385bcd4778a682276b95f5f116';

const SAVE_DEBOUNCE_MS = 2000;

export function DesmosPanel({ isOpen, storageKey }) {
  const hostRef     = useRef(null);
  const calcRef     = useRef(null);
  const saveTimer   = useRef(null);
  const rafRef      = useRef(null);
  const [ready, setReady] = useState(false);

  // If Desmos was loaded in an earlier page (via the global script
  // tag in app/layout.js), the constructor is already on window.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Desmos) setReady(true);
  }, []);

  // Init the calculator once the script is ready. Recreated only
  // if the storageKey changes (e.g. student navigated to a new
  // question).
  useEffect(() => {
    if (!ready || !hostRef.current || !window.Desmos) return;
    if (calcRef.current) return;  // already initialized

    calcRef.current = window.Desmos.GraphingCalculator(hostRef.current, {
      autosize: true, keypad: true, expressions: true, settingsMenu: true,
      zoomButtons: true, forceEnableGeometryFunctions: true,
      degreeMode: true, clearIntoDegreeMode: true,
      images: false, folders: false, notes: false, links: false,
      restrictedFunctions: false,
    });

    restoreFromLocalStorage();
    scheduleResize();
    // Observe changes → debounced save.
    calcRef.current.observeEvent?.('change', () => scheduleSave());

    return () => {
      // Save one last time on unmount.
      try { saveToLocalStorage(); } catch {}
      try { calcRef.current?.destroy?.(); } catch {}
      calcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // On storageKey change (new question), load the saved state for
  // that key, falling back to a blank calculator if nothing is
  // saved. Happens without tearing down the instance.
  useEffect(() => {
    if (!calcRef.current) return;
    restoreFromLocalStorage();
    scheduleResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // When the panel visibility changes, ask Desmos to resize so
  // layout is correct after the container dimensions change.
  useEffect(() => {
    if (!isOpen || !calcRef.current) return;
    scheduleResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function scheduleResize() {
    if (!calcRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      try { calcRef.current.resize(); } catch {}
    });
  }

  function saveToLocalStorage() {
    if (!calcRef.current || !storageKey) return;
    try {
      const st = calcRef.current.getState();
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(storageKey, JSON.stringify(st));
      }
    } catch {}
  }

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveToLocalStorage, SAVE_DEBOUNCE_MS);
  }

  function restoreFromLocalStorage() {
    if (!calcRef.current || !storageKey) return;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        // No saved state for this key — clear to a blank calculator
        // rather than letting stale expressions from a previous key
        // leak in.
        calcRef.current.setBlank?.();
        return;
      }
      const st = JSON.parse(raw);
      calcRef.current.setState(st, { allowUndo: false });
    } catch {}
  }

  return (
    <>
      <Script
        src={`https://www.desmos.com/api/v1.11/calculator.js?apiKey=${DESMOS_API_KEY}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <aside
        aria-label="Graphing calculator"
        aria-hidden={!isOpen}
        className={s.panel}
      >
        <div ref={hostRef} className={s.host} />
      </aside>
    </>
  );
}
