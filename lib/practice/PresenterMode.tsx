// Presenter mode (§4.2) — the full-screen review surface for a live
// tutoring session. AssignmentReport and GroupAssignmentReport mount
// this when the tutor hits Present: app chrome disappears (the
// overlay portals to <body> and requests browser fullscreen), type
// scales up for projection, ←/→ walk the questions, R reveals the
// current one, and a toggleable Excalidraw layer annotates on top.
//
// The reports stay the owners of all review state — which question
// is selected, what's revealed — and pass the rendered question in
// as children. Presenter is chrome + input handling only, so the
// map dots a tutor revealed while presenting are still marked when
// they exit back to the normal report.
//
// Excalidraw loads the same way the notes modal loads it (dynamic
// import on first use, module cached); the scene survives toggling
// the draw layer via a ref, and is deliberately not persisted —
// a whiteboard, not a document.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QuestionMapGrid } from './QuestionMapGrid';
import { DesmosPanel } from '@/lib/ui/DesmosPanel';
import s from './PresenterMode.module.css';

// Loose Excalidraw typing, same rationale as ExcalidrawNode.tsx.
type ExcalidrawComponent = React.ComponentType<Record<string, unknown>>;
let excalidrawLoader: Promise<ExcalidrawComponent | null> | null = null;
function ensureExcalidraw(): Promise<ExcalidrawComponent | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!excalidrawLoader) {
    excalidrawLoader = (async () => {
      try {
        await import('@excalidraw/excalidraw/index.css');
        const mod = await import('@excalidraw/excalidraw');
        return mod.Excalidraw as ExcalidrawComponent;
      } catch (err) {
        console.error('Excalidraw failed to load', err);
        excalidrawLoader = null;
        return null;
      }
    })();
  }
  return excalidrawLoader;
}

interface ExcalidrawSceneSnapshot {
  elements: readonly unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

/** Zoom steps for the projected type. */
const SCALES = [1, 1.15, 1.3, 1.5] as const;

export interface PresenterModeProps {
  title: string;
  subtitle?: string | null;
  /** QuestionMapGrid groups — the same array the report builds. */
  groups: Parameters<typeof QuestionMapGrid>[0]['groups'];
  /** Ordered item positions (the walk for ←/→). */
  positions: readonly number[];
  selectedPosition: number;
  onSelect: (position: number) => void;
  revealed: ReadonlySet<number>;
  onReveal: (position: number) => void;
  onRevealAll: () => void;
  onExit: () => void;
  /** True when the current question is a math question — shows the
   *  Desmos pane (default open) in the runner's two-column format. */
  desmosEligible?: boolean;
  /** Per-question identity for the Desmos localStorage key, matching
   *  the practice runner's per-question graph persistence. */
  desmosKey?: string | number | null;
  children: React.ReactNode;
}

export function PresenterMode({
  title,
  subtitle = null,
  groups,
  positions,
  selectedPosition,
  onSelect,
  revealed,
  onReveal,
  onRevealAll,
  onExit,
  desmosEligible = false,
  desmosKey = null,
  children,
}: PresenterModeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scaleIdx, setScaleIdx] = useState(1);
  const [mapOpen, setMapOpen] = useState(true);
  const [calcOpen, setCalcOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [Excalidraw, setExcalidraw] = useState<ExcalidrawComponent | null>(null);
  const sceneRef = useRef<ExcalidrawSceneSnapshot | null>(null);

  const index = Math.max(0, positions.indexOf(selectedPosition));
  const isRevealed = revealed.has(selectedPosition);
  const allRevealed = revealed.size >= positions.length;

  const step = useCallback(
    (delta: number) => {
      const next = positions[index + delta];
      if (next !== undefined) onSelect(next);
    },
    [positions, index, onSelect],
  );

  // The reports pass onExit as an inline closure (new identity every
  // render), so effects must never list it as a dependency — the
  // fullscreen effect re-running on each parent render exited and
  // re-requested fullscreen on every Next/Back. Read it via a ref.
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; });

  // ── Fullscreen + scroll lock ────────────────────────────────────
  // Best-effort browser fullscreen: some contexts (iframes, iPad
  // Safari settings) refuse — the fixed overlay still covers the
  // viewport, so presenting works either way. Losing fullscreen
  // does NOT close presenter: native dialogs (Excalidraw's image
  // upload file picker, print, etc.) force the browser out of
  // fullscreen, and closing the whole presenter on that made
  // Draw → Upload image exit the session. Instead we track the
  // state and offer a "⛶ Fullscreen" button to re-enter; exiting
  // presenter is the ✕ button or Esc (pressed while not
  // fullscreen — the first Esc in fullscreen only leaves
  // fullscreen, which is the browser's own behavior).
  // Mount-only: fullscreen is entered once per presenter session.
  useEffect(() => {
    const el = rootRef.current;
    el?.requestFullscreen?.().catch(() => {});
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.body.style.overflow = prevOverflow;
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  // ── Keyboard ────────────────────────────────────────────────────
  // Suspended while the draw layer is up: Excalidraw owns the
  // keyboard there (its tools live on single letters). Esc still
  // works — it drops the draw layer first, then exits presenter.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (drawing) setDrawing(false);
        else if (!document.fullscreenElement) onExitRef.current();
        // With fullscreen active the browser's own Esc handling
        // exits fullscreen first; a second Esc closes presenter.
        return;
      }
      if (drawing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
      else if (e.key === 'r' || e.key === 'R') { e.preventDefault(); onReveal(selectedPosition); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawing, step, onReveal, selectedPosition]);

  // Excalidraw loads lazily the first time the draw layer opens.
  useEffect(() => {
    if (!drawing || Excalidraw) return;
    let cancelled = false;
    ensureExcalidraw().then((mod) => {
      if (!cancelled) setExcalidraw(() => mod);
    });
    return () => { cancelled = true; };
  }, [drawing, Excalidraw]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div ref={rootRef} className={s.root}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className={s.topBar}>
        <div className={s.topBarLeft}>
          <span className={s.title}>{title}</span>
          {subtitle ? <span className={s.subtitle}>{subtitle}</span> : null}
        </div>
        <div className={s.topBarCenter}>
          <button type="button" className={s.navBtn} onClick={() => step(-1)} disabled={index <= 0} aria-label="Previous question (←)">
            ←
          </button>
          <button type="button" className={s.counterBtn} onClick={() => setMapOpen((v) => !v)} aria-expanded={mapOpen}>
            Question {index + 1} of {positions.length}
          </button>
          <button
            type="button"
            className={s.navBtn}
            onClick={() => step(1)}
            disabled={index >= positions.length - 1}
            aria-label="Next question (→)"
          >
            →
          </button>
        </div>
        <div className={s.topBarRight}>
          <button
            type="button"
            className={s.toolBtn}
            onClick={() => setScaleIdx((i) => Math.max(0, i - 1))}
            disabled={scaleIdx === 0}
            aria-label="Smaller text"
          >
            A−
          </button>
          <button
            type="button"
            className={s.toolBtn}
            onClick={() => setScaleIdx((i) => Math.min(SCALES.length - 1, i + 1))}
            disabled={scaleIdx === SCALES.length - 1}
            aria-label="Larger text"
          >
            A+
          </button>
          <button
            type="button"
            className={`${s.toolBtn} ${!isRevealed ? s.toolBtnAccent : ''}`}
            onClick={() => onReveal(selectedPosition)}
            disabled={isRevealed}
          >
            {isRevealed ? 'Revealed' : 'Reveal (R)'}
          </button>
          <button type="button" className={s.toolBtn} onClick={onRevealAll} disabled={allRevealed}>
            Reveal all
          </button>
          {desmosEligible ? (
            <button
              type="button"
              className={`${s.toolBtn} ${calcOpen ? s.toolBtnActive : ''}`}
              onClick={() => setCalcOpen((v) => !v)}
              aria-pressed={calcOpen}
            >
              Calculator
            </button>
          ) : null}
          <button
            type="button"
            className={`${s.toolBtn} ${drawing ? s.toolBtnActive : ''}`}
            onClick={() => setDrawing((v) => !v)}
            aria-pressed={drawing}
          >
            ✎ Draw
          </button>
          {!isFullscreen ? (
            <button
              type="button"
              className={s.toolBtn}
              onClick={() => rootRef.current?.requestFullscreen?.().catch(() => {})}
              aria-label="Re-enter fullscreen"
            >
              ⛶ Fullscreen
            </button>
          ) : null}
          <button type="button" className={s.exitBtn} onClick={onExit}>
            ✕ Exit
          </button>
        </div>
      </div>

      {/* ── Jump map (collapsible) ──────────────────────────── */}
      {mapOpen ? (
        <div className={s.mapDrawer}>
          <QuestionMapGrid
            groups={groups}
            selectedId={selectedPosition}
            onSelect={(id: string | number) => {
              onSelect(Number(id));
              setMapOpen(false);
            }}
            revealed={revealed as Set<string | number>}
          />
        </div>
      ) : null}

      {/* ── Stage: optional Desmos pane + scrolling content ──
          The two-column format mirrors the practice runner's math
          layout: calculator on the left, question on the right.
          The draw layer overlays the stage only, so the top bar
          and map drawer stay reachable while drawing. */}
      <div className={s.stage}>
        {desmosEligible ? (
          <div className={`${s.desmosPane} ${calcOpen ? '' : s.desmosPaneClosed}`}>
            <DesmosPanel
              key={`presenter-desmos-${desmosKey ?? 'q'}`}
              isOpen={calcOpen}
              storageKey={desmosKey != null ? `desmos:presenter:${desmosKey}` : undefined}
              fitToContainer
            />
          </div>
        ) : null}

        <div className={s.scroll}>
          <div
            className={`${s.content} ${drawing ? s.contentDrawing : ''}`}
            style={{ zoom: SCALES[scaleIdx] }}
          >
            {children}
          </div>
        </div>

        {/* ── Draw layer ────────────────────────────────────── */}
        {drawing ? (
        <div className={s.drawLayer}>
          {Excalidraw ? (
            <Excalidraw
              initialData={
                sceneRef.current ?? {
                  appState: { viewBackgroundColor: 'transparent', currentItemStrokeColor: '#e03131' },
                }
              }
              onChange={(
                elements: readonly unknown[],
                appState: Record<string, unknown>,
                files: Record<string, unknown>,
              ) => {
                sceneRef.current = { elements, appState, files };
              }}
              UIOptions={{
                canvasActions: {
                  export: false,
                  loadScene: false,
                  saveToActiveFile: false,
                  toggleTheme: false,
                },
              }}
            />
          ) : (
            <div className={s.drawLoading}>Loading whiteboard…</div>
          )}
        </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
