// Presenter mode (§4.2) — the full-viewport review surface for a live
// tutoring session. AssignmentReport and GroupAssignmentReport mount
// this when the tutor hits Present: app chrome disappears (the
// overlay portals to <body> and covers the viewport), type scales up
// for projection, ←/→ walk the questions, R reveals the current one,
// and a toggleable Excalidraw layer annotates on top.
//
// Browser fullscreen is opt-in, via the ⛶ Fullscreen button. Taking
// over the whole display is an invasive thing to do to someone who
// only clicked Present — it hides their tab bar, dock and clock, and
// on a second monitor it's often the wrong screen — so it's offered,
// not imposed. The overlay already covers the viewport, so presenting
// works the same either way.
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

/** Zoom steps for the projected type. Applied as a `transform: scale()`
 *  via --presenter-scale, not CSS `zoom` — see .content in the
 *  stylesheet for why (Safari mis-sizes MathJax under `zoom`). */
const SCALES = [1, 1.15, 1.3, 1.5] as const;

/** Above this many questions the jump map switches to the dense
 *  layout (a full practice test is 98; assignments run ~30-40). */
const DENSE_MAP_THRESHOLD = 40;

/** Desmos pane width (% of the stage), draggable via the divider. */
const CALC_WIDTH_KEY = 'sw:presenter-calc-width';
const CALC_DEFAULT_PCT = 46;
const CALC_MIN_PCT = 25;
const CALC_MAX_PCT = 65;
const clampCalcPct = (p: number) => Math.min(CALC_MAX_PCT, Math.max(CALC_MIN_PCT, p));

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
  /** Taxonomy of the current question — shown as a meta strip under
   *  the top bar so the tutor can cite topic/skill + score band while
   *  presenting. Null/absent (e.g. a missing question) hides the strip. */
  taxonomy?: {
    domainName?: string | null;
    skillName?: string | null;
    scoreBand?: number | null;
  } | null;
  /** Concept-tag editor for the current question, or null when the
   *  viewer can't tag (the reports only pass it for manager/admin —
   *  the same server-resolved gate as the in-report tag tools).
   *  Presenter hides it behind a "Show tags" toggle so tags don't
   *  project to students by default. */
  tagsNode?: React.ReactNode;
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
  taxonomy = null,
  tagsNode = null,
  desmosEligible = false,
  desmosKey = null,
  children,
}: PresenterModeProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const desmosPaneRef = useRef<HTMLDivElement>(null);
  const [scaleIdx, setScaleIdx] = useState(1);
  const [mapOpen, setMapOpen] = useState(true);
  const [calcOpen, setCalcOpen] = useState(true);
  // Tags start hidden every presenting session (they're staff-facing;
  // the projector shouldn't show them unless the tutor asks). Once
  // toggled on, the choice persists across questions.
  const [tagsShown, setTagsShown] = useState(false);
  const [calcWidth, setCalcWidth] = useState(CALC_DEFAULT_PCT);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [Excalidraw, setExcalidraw] = useState<ExcalidrawComponent | null>(null);
  const sceneRef = useRef<ExcalidrawSceneSnapshot | null>(null);
  // Excalidraw's imperative API (updateScene) — used by the presenter's
  // own Clear button and the transparent-background guard below.
  const excaliApiRef = useRef<{ updateScene: (scene: Record<string, unknown>) => void } | null>(null);

  // Restore the tutor's preferred calculator split across sessions.
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(CALC_WIDTH_KEY));
      if (Number.isFinite(stored) && stored >= CALC_MIN_PCT && stored <= CALC_MAX_PCT) {
        setCalcWidth(stored);
      }
    } catch { /* storage unavailable — keep the default */ }
  }, []);

  const commitCalcWidth = useCallback((pct: number) => {
    const next = clampCalcPct(pct);
    setCalcWidth(next);
    try { window.localStorage.setItem(CALC_WIDTH_KEY, String(Math.round(next))); } catch { /* ignore */ }
  }, []);

  // Drag the divider to resize the calculator column. Pointer capture
  // routes every move to the divider (so the drag survives crossing
  // the Desmos canvas), and the pane's flex-basis is written directly
  // during the drag — React state commits once, on release (the
  // FloatingCalculator pattern: smoother than re-rendering per frame).
  const onDividerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const divider = e.currentTarget;
    const pctAt = (clientX: number) => clampCalcPct(((clientX - rect.left) / rect.width) * 100);
    const onMove = (ev: PointerEvent) => {
      if (desmosPaneRef.current) desmosPaneRef.current.style.flexBasis = `${pctAt(ev.clientX)}%`;
    };
    const finish = (ev: PointerEvent) => {
      commitCalcWidth(pctAt(ev.clientX));
      divider.removeEventListener('pointermove', onMove);
      divider.removeEventListener('pointerup', finish);
      divider.removeEventListener('pointercancel', finish);
    };
    divider.setPointerCapture(e.pointerId);
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup', finish);
    divider.addEventListener('pointercancel', finish);
  }, [commitCalcWidth]);

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
  // render), so effects must never list it as a dependency: an effect
  // that tears down and re-runs on every parent render used to exit
  // and re-request fullscreen on each Next/Back. Read it via a ref.
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; });

  // ── Fullscreen tracking + scroll lock ───────────────────────────
  // Presenter does NOT request fullscreen on mount — the tutor opts
  // in with the "⛶ Fullscreen" button (see the file header). This
  // effect only tracks the state so that button knows whether to
  // show, and drops fullscreen on the way out if it was entered.
  //
  // Losing fullscreen does NOT close presenter: native dialogs
  // (Excalidraw's image upload file picker, print, etc.) force the
  // browser out of fullscreen, and closing the whole presenter on
  // that made Draw → Upload image exit the session. Exiting is the
  // ✕ button or Esc — and while fullscreen is on, the first Esc only
  // leaves fullscreen (the browser's own behavior), so it takes a
  // second one.
  useEffect(() => {
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
  //
  // Every key, Esc included, is ignored while a text field has focus.
  // Esc used to be handled ahead of that guard, so dismissing the
  // concept-tag search popover (its input closes itself on Esc and
  // doesn't stop propagation) tore down the whole presenter session
  // mid-lesson. Browser fullscreen was quietly absorbing the first
  // Esc and masking it; now that fullscreen is opt-in, it isn't.
  // Closing the field unmounts it, so focus is back on the body by
  // the time a second Esc arrives and that one exits presenter —
  // innermost-first dismissal, which is what Esc should do.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || target?.isContentEditable === true;
      if (inField) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (drawing) setDrawing(false);
        else if (!document.fullscreenElement) onExitRef.current();
        // With fullscreen active the browser's own Esc handling
        // exits fullscreen first; a second Esc closes presenter.
        return;
      }
      if (drawing) return;
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
          {drawing ? (
            <button
              type="button"
              className={s.toolBtn}
              onClick={() => excaliApiRef.current?.updateScene({ elements: [] })}
            >
              Clear drawing
            </button>
          ) : null}
          {!isFullscreen ? (
            <button
              type="button"
              className={s.toolBtn}
              onClick={() => rootRef.current?.requestFullscreen?.().catch(() => {})}
              aria-label="Enter fullscreen"
            >
              ⛶ Fullscreen
            </button>
          ) : null}
          <button type="button" className={s.exitBtn} onClick={onExit}>
            ✕ Exit
          </button>
        </div>
      </div>

      {/* ── Question meta: topic/skill + score band ─────────── */}
      {taxonomy && (taxonomy.domainName || taxonomy.skillName || taxonomy.scoreBand != null) ? (
        <div className={s.metaBar}>
          {taxonomy.domainName ? <span className={s.metaItem}>{taxonomy.domainName}</span> : null}
          {taxonomy.skillName ? <span className={s.metaItem}>{taxonomy.skillName}</span> : null}
          {taxonomy.scoreBand != null ? (
            <span className={s.metaBand}>Band {taxonomy.scoreBand}</span>
          ) : null}
        </div>
      ) : null}

      {/* ── Jump map (collapsible) ──────────────────────────── */}
      {mapOpen ? (
        <div className={s.mapDrawer}>
          <QuestionMapGrid
            groups={groups}
            selectedId={selectedPosition}
            onSelect={(id: string | number) => onSelect(Number(id))}
            revealed={revealed as Set<string | number>}
            dense={positions.length > DENSE_MAP_THRESHOLD}
          />
        </div>
      ) : null}

      {/* ── Stage: optional Desmos pane + scrolling content ──
          The two-column format mirrors the practice runner's math
          layout: calculator on the left, question on the right.
          The draw layer overlays the stage only, so the top bar
          and map drawer stay reachable while drawing. */}
      <div ref={stageRef} className={s.stage}>
        {desmosEligible ? (
          <>
            <div
              ref={desmosPaneRef}
              className={`${s.desmosPane} ${calcOpen ? '' : s.desmosPaneClosed}`}
              style={calcOpen ? { flexBasis: `${calcWidth}%` } : undefined}
            >
              <DesmosPanel
                key={`presenter-desmos-${desmosKey ?? 'q'}`}
                isOpen={calcOpen}
                storageKey={desmosKey != null ? `desmos:presenter:${desmosKey}` : undefined}
                fitToContainer
              />
            </div>
            {calcOpen ? (
              <div
                className={s.divider}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize calculator (drag, or left/right arrow keys)"
                tabIndex={0}
                onPointerDown={onDividerPointerDown}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  // Stop the presenter's global ←/→ question walk from
                  // firing while the divider itself is focused.
                  e.preventDefault();
                  e.stopPropagation();
                  commitCalcWidth(calcWidth + (e.key === 'ArrowRight' ? 4 : -4));
                }}
              />
            ) : null}
          </>
        ) : null}

        {/* The projection scale lives on the scroller, not on
            .content, so the staff chrome below can align its padding
            to the scaled question without being scaled itself. */}
        <div
          className={s.scroll}
          style={{ '--presenter-scale': SCALES[scaleIdx] } as React.CSSProperties}
        >
          <div className={`${s.content} ${drawing ? s.contentDrawing : ''}`}>
            {children}
          </div>

          {/* Concept tags — where they usually show (below the
              question), collapsed behind a toggle.

              Deliberately a SIBLING of .content, not a child. The tag
              popover positions itself fixed, at viewport coordinates
              it measures with getBoundingClientRect. Inside .content
              those coordinates land in the projection scale's frame
              rather than the viewport's, so the popover opens away
              from its button and renders scale× too wide. Keeping it
              out here also matches what tags are: staff chrome, like
              the top bar and meta strip, not projected content. */}
          {tagsNode != null ? (
            <div className={s.tagsSection}>
              <button
                type="button"
                className={s.showTagsBtn}
                onClick={() => setTagsShown((v) => !v)}
                aria-expanded={tagsShown}
              >
                {tagsShown ? 'Hide tags' : 'Show tags'}
              </button>
              {tagsShown ? tagsNode : null}
            </div>
          ) : null}
        </div>

        {/* ── Draw layer ────────────────────────────────────── */}
        {drawing ? (
        <div className={s.drawLayer}>
          {Excalidraw ? (
            <Excalidraw
              excalidrawAPI={(api: { updateScene: (scene: Record<string, unknown>) => void } | null) => {
                excaliApiRef.current = api;
              }}
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
                // The canvas must stay transparent — a white background
                // paints over the question. Excalidraw resets
                // viewBackgroundColor on some internal actions; snap it
                // back whenever anything sets it (one extra onChange
                // fires with 'transparent', then this stays quiet).
                if (appState?.viewBackgroundColor !== 'transparent') {
                  excaliApiRef.current?.updateScene({
                    appState: { viewBackgroundColor: 'transparent' },
                  });
                }
              }}
              UIOptions={{
                canvasActions: {
                  export: false,
                  loadScene: false,
                  saveToActiveFile: false,
                  toggleTheme: false,
                  // Excalidraw's own clear-canvas confirm dialog portals
                  // outside the fullscreened presenter element, so it's
                  // invisible in fullscreen — and confirming it resets
                  // the background to white. The top bar's "Clear
                  // drawing" button replaces it (no dialog, background
                  // untouched). Same reason the background picker is
                  // hidden: transparent is load-bearing here.
                  clearCanvas: false,
                  changeViewBackgroundColor: false,
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
