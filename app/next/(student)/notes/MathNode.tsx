// TipTap node + React node-view for the inline math element.
//
// The node carries one attribute (`latex`). Its node-view mounts a
// MathLive `<math-field>` web component. In edit mode the field is
// fully interactive — every interaction is mirrored into the doc
// through updateAttributes so the editor's onUpdate sees it.
//
// MathLive is loaded via dynamic import on first node mount so it
// stays out of the editor's initial bundle until the doc actually
// contains math.
//
// MathLive's API has shifted across recent versions, so all reads
// and writes go through readMathFieldValue / writeMathFieldValue
// helpers that try the documented APIs in order:
//   1. setValue(latex) / getValue('latex-expanded' || 'latex')
//   2. .value setter / getter
//   3. textContent (works during element upgrade, before scripting)
// This module never throws if one of those paths is missing — it
// silently falls through. The node attrs are the source of truth
// the editor persists.

'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface MathfieldElementStatic {
  fontsDirectory?: string | null;
  soundsDirectory?: string | null;
  loadFonts?: () => Promise<unknown>;
}

let mathLiveLoader: Promise<unknown> | null = null;
function ensureMathLive(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!mathLiveLoader) {
    mathLiveLoader = import('mathlive')
      .then(async (mod) => {
        // MathLive resolves its bundled WOFF2 math fonts relative to
        // the script URL by default, which under Next.js becomes
        // /_next/static/chunks/fonts/* — a 404. We host the fonts
        // ourselves under /public/mathlive-fonts and point MathLive
        // there.
        //
        // Order matters: the directory has to be set BEFORE any
        // <math-field> connects, because MathLive bakes the URL into
        // its FontFace objects during connectedCallback. We then call
        // loadFonts() explicitly so the FontFace registration uses
        // the corrected URL even if a math-field has already been
        // connected with the old default. The MathFieldView below
        // gates its <math-field> render on this promise resolving,
        // which is the load-bearing guarantee for fresh mounts.
        const MFE = (mod as { MathfieldElement?: MathfieldElementStatic })
          .MathfieldElement;
        if (MFE) {
          try { MFE.fontsDirectory = '/mathlive-fonts'; } catch { /* */ }
          try { MFE.soundsDirectory = null; } catch { /* */ }
          if (typeof MFE.loadFonts === 'function') {
            try { await MFE.loadFonts(); } catch { /* */ }
          }
        }
        return mod;
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('MathLive failed to load', err);
        mathLiveLoader = null;
        return null;
      });
  }
  return mathLiveLoader;
}

interface MathFieldLike {
  value?: string;
  getValue?: (...args: unknown[]) => string;
  setValue?: (value: string, options?: unknown) => void;
}

export function readMathFieldValue(el: HTMLElement | null | undefined): string {
  if (!el) return '';
  const e = el as unknown as MathFieldLike;
  if (typeof e.getValue === 'function') {
    try {
      const v = e.getValue();
      if (typeof v === 'string') return v;
    } catch {
      /* fall through */
    }
  }
  if (typeof e.value === 'string') return e.value;
  // Pre-upgrade: the math-field still has its initial textContent.
  return el.textContent ?? '';
}

export function writeMathFieldValue(el: HTMLElement | null | undefined, value: string): void {
  if (!el) return;
  const e = el as unknown as MathFieldLike;
  if (typeof e.setValue === 'function') {
    try {
      e.setValue(value);
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    e.value = value;
    return;
  } catch {
    /* fall through */
  }
  el.textContent = value;
}

function MathFieldView({ node, updateAttributes, editor }: NodeViewProps) {
  const ref = useRef<HTMLElement | null>(null);
  const editable = editor.isEditable;
  // Gate the <math-field> render on MathLive being loaded AND the
  // fontsDirectory being applied. If we render the element before
  // that, the upgrade fires immediately and MathLive bakes the
  // wrong font URLs into its FontFace registration — which is what
  // produced the cascade of /_next/static/chunks/fonts/* 404s and
  // a math-field that looked blank because the substitute system
  // font has no fraction or root glyphs.
  const [mathLiveReady, setMathLiveReady] = useState(false);
  // Mirrors node.attrs.latex without provoking React re-renders. The
  // event handlers in the second effect below need to read the latest
  // attr value to short-circuit duplicate writes, but tying that
  // closure to a state value would tear down the listener on every
  // keystroke.
  const docLatexRef = useRef<string>((node.attrs.latex as string) ?? '');
  useEffect(() => {
    docLatexRef.current = (node.attrs.latex as string) ?? '';
  }, [node.attrs.latex]);

  useEffect(() => {
    let cancelled = false;
    ensureMathLive().then(() => {
      if (!cancelled) setMathLiveReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // (1) Apply the read-only state and the latest doc-side latex value
  // every time the math-field is on screen, MathLive has finished
  // loading, or `node.attrs.latex` changes externally (undo/redo,
  // server reseed after save). Uses useLayoutEffect so the value is
  // written before the browser paints — otherwise the field would
  // paint blank for one frame after a re-seed and the user would see
  // the equation flicker.
  //
  // The `mathLiveReady` dep is load-bearing: ref.current is null
  // before the gate flips, so the previous useEffect-based version
  // skipped this work and never ran again because its other deps
  // (latex, editable) hadn't changed.
  useLayoutEffect(() => {
    if (!mathLiveReady) return;
    const el = ref.current;
    if (!el) return;
    if (!editable) {
      el.setAttribute('readonly', '');
      try { (el as unknown as { readOnly?: boolean }).readOnly = true; } catch { /* */ }
    } else {
      el.removeAttribute('readonly');
      try { (el as unknown as { readOnly?: boolean }).readOnly = false; } catch { /* */ }
    }
    const target = (node.attrs.latex as string) ?? '';
    const current = readMathFieldValue(el);
    if (current !== target) {
      writeMathFieldValue(el, target);
    }
  }, [mathLiveReady, node.attrs.latex, editable]);

  // (2) Track user input. Same gate on `mathLiveReady` so the
  // listener attaches as soon as the math-field exists.
  useLayoutEffect(() => {
    if (!mathLiveReady) return undefined;
    const el = ref.current;
    if (!el || !editable) return undefined;
    const handler = () => {
      const next = readMathFieldValue(el);
      // Don't blank out the doc with an empty read. MathLive emits
      // transient empty events during focus/blur on some versions;
      // those would otherwise wipe a non-empty equation.
      if (next === '' && docLatexRef.current !== '') return;
      if (next !== docLatexRef.current) {
        docLatexRef.current = next;
        updateAttributes({ latex: next });
      }
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    return () => {
      el.removeEventListener('input', handler);
      el.removeEventListener('change', handler);
    };
  }, [mathLiveReady, editable, updateAttributes]);

  if (!mathLiveReady) {
    // Pre-load placeholder. Renders the latex source so the
    // surrounding text isn't visually broken while MathLive resolves;
    // this branch is only on screen for one or two frames in
    // practice (the import is cache-hit after the first node).
    return (
      <NodeViewWrapper
        as="span"
        className="math-node math-node-loading"
        data-editable={editable ? 'true' : 'false'}
      >
        <span
          style={{
            display: 'inline-block',
            verticalAlign: 'middle',
            padding: '0 4px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.9em',
            opacity: 0.6,
          }}
        >
          {(node.attrs.latex as string) || '∑'}
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      className="math-node"
      data-editable={editable ? 'true' : 'false'}
    >
      <math-field
        ref={ref as React.Ref<HTMLElement>}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          minWidth: '1.5em',
          padding: '0 2px',
          border: editable ? '1px dashed var(--border-subtle, #ccd)' : 'none',
          borderRadius: '3px',
          background: editable ? 'var(--bg-soft, #fafbff)' : 'transparent',
        }}
      >
        {/* MathLive picks up textContent at upgrade time, which is
            the only reliable way to seed the value before the
            element's scripts have run. The .value/.setValue path in
            effect (1) takes over for everything afterwards. */}
        {(node.attrs.latex as string) ?? ''}
      </math-field>
    </NodeViewWrapper>
  );
}

export const MathExtension = Node.create({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-latex') ?? '',
        renderHTML: (attrs: { latex: string }) => ({ 'data-latex': attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-math]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathFieldView);
  },
});
