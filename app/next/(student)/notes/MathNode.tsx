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
import { useEffect, useRef } from 'react';

let mathLiveLoader: Promise<unknown> | null = null;
function ensureMathLive(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!mathLiveLoader) {
    mathLiveLoader = import('mathlive')
      .then((mod) => {
        // MathLive resolves its bundled WOFF2 math fonts relative to
        // the script URL by default, which under Next.js becomes
        // /_next/static/chunks/fonts/* — a 404. We host the fonts
        // ourselves under /public/mathlive-fonts and point MathLive
        // there. Set once, before any <math-field> renders.
        const MFE = (mod as { MathfieldElement?: {
          fontsDirectory?: string | null;
          soundsDirectory?: string | null;
        } }).MathfieldElement;
        if (MFE) {
          try { MFE.fontsDirectory = '/mathlive-fonts'; } catch { /* */ }
          // Disable the keypress sounds entirely — we don't ship the
          // .wav files, and the default loader otherwise 404s on each.
          try { MFE.soundsDirectory = null; } catch { /* */ }
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
  // Mirrors node.attrs.latex without provoking React re-renders. The
  // event handlers in the second effect below need to read the latest
  // attr value to short-circuit duplicate writes, but tying that
  // closure to a state value would tear down the listener on every
  // keystroke.
  const docLatexRef = useRef<string>((node.attrs.latex as string) ?? '');
  useEffect(() => {
    docLatexRef.current = (node.attrs.latex as string) ?? '';
  }, [node.attrs.latex]);

  // (1) Set the read-only state and the initial / external value.
  // Re-runs only when the editable flag flips or the doc-side latex
  // changes from outside this node-view (undo/redo, server reseed).
  // Crucially this effect does NOT respond to its own updateAttributes
  // calls because those go through the docLatexRef short-circuit in
  // effect (2).
  useEffect(() => {
    let cancelled = false;
    ensureMathLive().then(() => {
      if (cancelled) return;
      const el = ref.current;
      if (!el) return;

      // MathLive's reflected attribute is `readonly` (HTML idiom),
      // not `read-only`. Some 0.x builds also accept `read-only`;
      // setting the property too covers both.
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
    });
    return () => {
      cancelled = true;
    };
  }, [node.attrs.latex, editable]);

  // (2) Track user input. Listen on both `input` (every keystroke)
  // and `change` (fires on blur with the final value) so we capture
  // the value even if MathLive batches inputs into a single change.
  // The `attached` flag pins the listeners across re-renders so a
  // node.attrs.latex change doesn't tear them down mid-typing.
  useEffect(() => {
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
  }, [editable, updateAttributes]);

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
