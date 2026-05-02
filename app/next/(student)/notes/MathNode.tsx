// TipTap node + React node-view for the inline math element.
//
// The node carries one attribute (`latex`). Its node-view mounts a
// MathLive `<math-field>` web component. In edit mode the field is
// fully interactive — keystrokes flow back into the node through
// updateAttributes, so the parent editor's onUpdate sees the change
// and includes it in the next save. In read-only mode the field is
// static (read-only attribute set) and won't surface the virtual
// keyboard.
//
// MathLive is loaded via dynamic import on first node mount so it
// stays out of the editor's initial bundle until the doc actually
// contains math.

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
    mathLiveLoader = import('mathlive').catch((err) => {
      // eslint-disable-next-line no-console
      console.error('MathLive failed to load', err);
      mathLiveLoader = null;
      return null;
    });
  }
  return mathLiveLoader;
}

function MathFieldView({ node, updateAttributes, editor }: NodeViewProps) {
  const ref = useRef<HTMLElement | null>(null);
  const editable = editor.isEditable;

  useEffect(() => {
    let cancelled = false;
    ensureMathLive().then(() => {
      if (cancelled) return;
      const el = ref.current;
      if (!el) return;
      // The web-component reads attributes for these — set after
      // upgrade so a late-initializing element still picks them up.
      if (!editable) {
        el.setAttribute('read-only', 'true');
      } else {
        el.removeAttribute('read-only');
      }
      const setValue = () => {
        const next = (node.attrs.latex as string) ?? '';
        const current = (el as unknown as { value?: string }).value ?? '';
        if (current !== next) {
          (el as unknown as { value?: string }).value = next;
        }
      };
      setValue();
    });
    return () => {
      cancelled = true;
    };
    // Re-sync whenever the doc-side latex changes (e.g. undo/redo).
    // editor.isEditable changes are picked up via the editable closure.
  }, [node.attrs.latex, editable]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !editable) return undefined;
    const handler = () => {
      const next = (el as unknown as { value?: string }).value ?? '';
      if (next !== node.attrs.latex) {
        updateAttributes({ latex: next });
      }
    };
    el.addEventListener('input', handler);
    return () => el.removeEventListener('input', handler);
  }, [editable, updateAttributes, node.attrs.latex]);

  // The math-field tag is a custom element registered by MathLive.
  // React 19 passes through unknown tags as-is.
  return (
    <NodeViewWrapper
      as="span"
      className="math-node"
      data-editable={editable ? 'true' : 'false'}
    >
      {/* @ts-expect-error — math-field is a runtime-registered custom element */}
      <math-field
        ref={ref}
        style={{
          display: 'inline-block',
          verticalAlign: 'middle',
          minWidth: '1.5em',
          padding: '0 2px',
          border: editable ? '1px dashed var(--border-subtle, #ccd)' : 'none',
          borderRadius: '3px',
          background: editable ? 'var(--bg-soft, #fafbff)' : 'transparent',
        }}
      />
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
    // Plain HTML serialization (used when copying the doc out of the
    // editor). The runtime renderer is the React node-view above.
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathFieldView);
  },
});
