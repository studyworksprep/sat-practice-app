// TipTap node + React node-view for an Excalidraw drawing block.
//
// Mirrors the math node's storage shape: the source of truth lives
// in the node's `attrs`, persisted as part of the TipTap doc inside
// student_notes.body_json. Two attrs:
//
//   - scene:  the full Excalidraw scene { elements, appState, files }
//             as a JSON-serializable object. This is what the editor
//             needs to re-open the drawing.
//   - svg:    a serialized SVG string of the rendered scene. We
//             snapshot this at save time so the read-only view (and
//             the index-page snippets) can render the diagram
//             without booting Excalidraw — Excalidraw's bundle is
//             ~1MB and we don't want it on the cards page.
//
// Excalidraw is loaded via dynamic import inside the modal, the same
// way MathNode loads MathLive on first mount, so a doc with no
// drawings doesn't pay the bundle cost.
//
// Edit flow:
//   - The block always shows the SVG snapshot.
//   - In edit mode, a small "Edit drawing" button below the SVG opens
//     a fullscreen modal with the Excalidraw editor seeded from
//     `scene`. Save in the modal captures the new scene + a fresh
//     SVG snapshot via exportToSvg, then writes both back through
//     updateAttributes.
//   - In read-only mode the button is hidden — same component, same
//     SVG, no editor mount.

'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type Editor,
  type NodeViewProps,
} from '@tiptap/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeHtml } from '@/lib/ui/SafeHtml';
import s from './Notes.module.css';

// ──────────────────────────────────────────────────────────────
// Types — we keep these intentionally loose so a future Excalidraw
// version that broadens its element / appState shape doesn't force
// a TypeScript regen here. The runtime contract with Excalidraw is
// the function signatures, not the field-by-field shape.
// ──────────────────────────────────────────────────────────────

interface ExcalidrawScene {
  elements: unknown[];
  appState: Record<string, unknown>;
  files?: Record<string, unknown>;
}

interface ExcalidrawAPI {
  getSceneElements: () => unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
}

const EMPTY_SCENE: ExcalidrawScene = {
  elements: [],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
};

// Cap on the serialized scene size before we refuse to save. 200KB
// covers most student diagrams comfortably while keeping rows
// retrievable in the cards-page batched read; anything bigger
// almost always means an embedded image and should live in a
// separate attachments table once we add one.
const MAX_SCENE_BYTES = 200_000;

// ──────────────────────────────────────────────────────────────
// Excalidraw lazy-loader. Mirrors MathNode.ensureMathLive — we
// memoize the import so a doc with three drawings only pays the
// bundle cost once, and so server-rendered HTML never tries to
// touch the Excalidraw module (it's browser-only).
// ──────────────────────────────────────────────────────────────

interface ExcalidrawModule {
  // Excalidraw exports `Excalidraw` as a default-style React component.
  // `exportToSvg` produces an SVGSVGElement we serialize with XMLSerializer.
  Excalidraw: React.ComponentType<Record<string, unknown>>;
  exportToSvg: (opts: {
    elements: unknown[];
    appState: Record<string, unknown>;
    files?: Record<string, unknown>;
    exportPadding?: number;
  }) => Promise<SVGSVGElement>;
}

let excalidrawLoader: Promise<ExcalidrawModule | null> | null = null;
function ensureExcalidraw(): Promise<ExcalidrawModule | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!excalidrawLoader) {
    excalidrawLoader = (async () => {
      try {
        // Side-effect import for the stylesheet — Excalidraw ships
        // its CSS as a separate entry. Without this, the toolbar
        // and color pickers render unstyled.
        await import('@excalidraw/excalidraw/index.css');
        const mod = await import('@excalidraw/excalidraw');
        return {
          Excalidraw: mod.Excalidraw as React.ComponentType<Record<string, unknown>>,
          exportToSvg: mod.exportToSvg as ExcalidrawModule['exportToSvg'],
        };
      } catch (err) {
        console.error('Excalidraw failed to load', err);
        excalidrawLoader = null;
        return null;
      }
    })();
  }
  return excalidrawLoader;
}

// ──────────────────────────────────────────────────────────────
// Modal — mounted only while the student is editing. Hosts the
// live Excalidraw editor; on save, we capture the latest scene +
// export an SVG and pass both back to the parent node-view.
// ──────────────────────────────────────────────────────────────

interface ExcalidrawModalProps {
  initialScene: ExcalidrawScene;
  onSave: (next: { scene: ExcalidrawScene; svg: string }) => void;
  onCancel: () => void;
}

function ExcalidrawModal({ initialScene, onSave, onCancel }: ExcalidrawModalProps) {
  const [mod, setMod] = useState<ExcalidrawModule | null>(null);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureExcalidraw().then((m) => {
      if (!cancelled) setMod(m);
    });
    return () => { cancelled = true; };
  }, []);

  // Escape closes the modal so it feels like the rest of the
  // popovers in the app. Click-outside intentionally does NOT close
  // — Excalidraw is a maximize-and-work surface, accidental
  // dismissal on stray clicks would lose the drawing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleSave = useCallback(async () => {
    if (!mod || !apiRef.current || busy) return;
    setBusy(true);
    setError(null);
    try {
      const elements = apiRef.current.getSceneElements();
      const appState = apiRef.current.getAppState();
      const files = apiRef.current.getFiles();

      const scene: ExcalidrawScene = { elements, appState, files };

      // Reject early if the serialized scene is over the budget so
      // the student sees a clear message instead of a Postgres
      // payload-too-large error after the network round-trip.
      const serialized = JSON.stringify(scene);
      if (serialized.length > MAX_SCENE_BYTES) {
        setError(
          `Drawing is too large to save (${Math.round(serialized.length / 1024)}KB; ` +
          `limit is ${Math.round(MAX_SCENE_BYTES / 1024)}KB). Try removing pasted images.`,
        );
        setBusy(false);
        return;
      }

      const svgEl = await mod.exportToSvg({
        elements,
        appState,
        files,
        exportPadding: 8,
      });
      const svg = new XMLSerializer().serializeToString(svgEl);

      onSave({ scene, svg });
    } catch (err) {
      console.error('Excalidraw save failed', err);
      setError('Could not save drawing. Try again.');
      setBusy(false);
    }
  }, [mod, busy, onSave]);

  if (!mod) {
    return (
      <div className={s.excalidrawModal} role="dialog" aria-label="Drawing editor">
        <div className={s.excalidrawModalLoading}>Loading drawing editor…</div>
      </div>
    );
  }

  const { Excalidraw } = mod;

  return (
    <div className={s.excalidrawModal} role="dialog" aria-label="Drawing editor">
      <div className={s.excalidrawModalHeader}>
        <span>Drawing</span>
        <div className={s.excalidrawModalActions}>
          <button
            type="button"
            className={s.btnSecondary}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={handleSave}
            disabled={busy}
          >
            {busy ? 'Saving…' : 'Save drawing'}
          </button>
        </div>
      </div>
      {error && <div className={s.errorBanner}>{error}</div>}
      <div className={s.excalidrawModalCanvas}>
        <Excalidraw
          initialData={{
            elements: initialScene.elements,
            appState: initialScene.appState,
            files: initialScene.files ?? {},
            scrollToContent: true,
          }}
          excalidrawAPI={(api: ExcalidrawAPI) => { apiRef.current = api; }}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Node-view: SVG snapshot + (in edit mode) an Edit / Remove row.
// ──────────────────────────────────────────────────────────────

function ExcalidrawNodeView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const editable = editor.isEditable;
  const [open, setOpen] = useState(false);

  const scene: ExcalidrawScene = useMemo(() => {
    const raw = node.attrs.scene as ExcalidrawScene | null;
    if (raw && Array.isArray(raw.elements)) return raw;
    return EMPTY_SCENE;
  }, [node.attrs.scene]);
  const svg = (node.attrs.svg as string) ?? '';

  // Open the modal automatically the first time an empty drawing
  // node is inserted, so the toolbar's "Drawing" button feels like
  // "open the drawing editor" rather than "drop a placeholder block."
  const isEmpty = scene.elements.length === 0;
  useEffect(() => {
    if (editable && isEmpty && !open) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = useCallback(
    (next: { scene: ExcalidrawScene; svg: string }) => {
      updateAttributes({ scene: next.scene, svg: next.svg });
      setOpen(false);
    },
    [updateAttributes],
  );

  const handleCancel = useCallback(() => {
    if (isEmpty) {
      // The student opened the modal via the toolbar button and then
      // hit Cancel without drawing anything — drop the empty block
      // so we don't leave a stray "Drawing" placeholder behind.
      deleteNode();
      return;
    }
    setOpen(false);
  }, [isEmpty, deleteNode]);

  return (
    <NodeViewWrapper
      as="div"
      className={s.drawingBlock}
      data-editable={editable ? 'true' : 'false'}
      contentEditable={false}
    >
      {svg ? (
        // Inline SVG — generated by Excalidraw's exportToSvg, then
        // round-tripped through the DB. SafeHtml's "note" profile
        // strips <script>, on*, and dangerous URIs while keeping the
        // SVG vocabulary the exporter actually emits.
        <SafeHtml
          kind="note"
          html={svg}
          className={s.drawingSvg}
        />
      ) : (
        <div className={s.drawingPlaceholder}>
          {editable ? 'Click "Edit drawing" to start.' : 'Empty drawing.'}
        </div>
      )}
      {editable && (
        <div className={s.drawingActions}>
          <button
            type="button"
            className={s.btnSecondary}
            onClick={() => setOpen(true)}
          >
            Edit drawing
          </button>
          <button
            type="button"
            className={s.btnDanger}
            onClick={() => deleteNode()}
          >
            Remove
          </button>
        </div>
      )}
      {open && (
        <ExcalidrawModal
          initialScene={scene}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </NodeViewWrapper>
  );
}

// ──────────────────────────────────────────────────────────────
// TipTap extension definition.
// ──────────────────────────────────────────────────────────────

export const ExcalidrawExtension = Node.create({
  name: 'excalidraw',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  // Drawings are leaf blocks. No nested content; the node-view owns
  // the entire visual area.
  content: '',

  addAttributes() {
    return {
      scene: {
        // ProseMirror serializes attrs as JSON, so we just hand it
        // the object verbatim. Default null (not {}) so the empty
        // case is unambiguous in the node-view.
        default: null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-scene');
          if (!raw) return null;
          try { return JSON.parse(raw); } catch { return null; }
        },
        renderHTML: (attrs: { scene: ExcalidrawScene | null }) => ({
          'data-scene': attrs.scene ? JSON.stringify(attrs.scene) : '',
        }),
      },
      svg: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-svg') ?? '',
        renderHTML: (attrs: { svg: string }) => ({ 'data-svg': attrs.svg }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-excalidraw]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-excalidraw': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawNodeView);
  },
});

/** Helper for the toolbar button — drops a fresh empty drawing
 *  block at the cursor. Exported so NoteEditor doesn't need to
 *  reach into the extension's internals. */
export function insertExcalidraw(editor: Editor): void {
  editor.chain().focus().insertContent({
    type: 'excalidraw',
    attrs: { scene: null, svg: '' },
  }).run();
}
