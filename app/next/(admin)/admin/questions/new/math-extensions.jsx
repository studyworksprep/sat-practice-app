'use client';

// TipTap nodes for math in the authoring editor:
//   - mathInline : an inline atom rendered as \( … \) on save.
//   - mathBlock  : a block atom rendered as a standalone display
//                  equation (\[ … \] in a centered paragraph) on save.
// Both store the equation as a LaTeX string in a `latex` attribute.
// In the editor they're displayed with KaTeX (fast, self-contained,
// already a dependency); the production student render still goes
// through the server-side MathJax pass, so editor fidelity only has
// to be close enough for authoring.
//
// Clicking a node asks the editor's RichEditor host to open the
// MathLive popover for editing — wired through a tiny `mathPopover`
// storage bridge so the React node views (rendered out-of-tree by
// ReactNodeViewRenderer) can reach the host without React context.

import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderKatex(latex, displayMode) {
  try {
    return katex.renderToString(latex && latex.trim() ? latex : '\\square', {
      displayMode,
      throwOnError: false,
      errorColor: '#b91c1c',
    });
  } catch {
    return null;
  }
}

function openEditor(editor, pos, latex, display) {
  const api = editor?.storage?.mathPopover?.getApi?.();
  if (typeof api === 'function') api({ pos, latex, display });
}

function MathInlineView({ node, editor, getPos, selected }) {
  const latex = node.attrs.latex || '';
  const html = renderKatex(latex, false);
  return (
    <NodeViewWrapper
      as="span"
      className="sw-math-inline"
      data-selected={selected ? 'true' : undefined}
      onClick={() => openEditor(editor, getPos(), latex, false)}
      title="Click to edit equation"
    >
      {html
        ? <span dangerouslySetInnerHTML={{ __html: html }} />
        : <span className="sw-math-raw">{latex || 'equation'}</span>}
    </NodeViewWrapper>
  );
}

function MathBlockView({ node, editor, getPos, selected }) {
  const latex = node.attrs.latex || '';
  const html = renderKatex(latex, true);
  return (
    <NodeViewWrapper
      className="sw-math-block"
      data-selected={selected ? 'true' : undefined}
      onClick={() => openEditor(editor, getPos(), latex, true)}
      title="Click to edit equation"
    >
      {html
        ? <span dangerouslySetInnerHTML={{ __html: html }} />
        : <span className="sw-math-raw">{latex || 'equation'}</span>}
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') || '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },
});

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') || '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-math-block]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
});

// Storage bridge: RichEditor configures this with a `getApi` accessor
// that returns its current "open the MathLive popover" callback (held
// in a ref so it stays fresh without re-creating the editor). The
// math node views — rendered out-of-tree by ReactNodeViewRenderer —
// read it back via editor.storage to request an edit. Configuring at
// creation (rather than mutating editor.storage afterward) keeps the
// hook's return value immutable.
export const MathPopoverBridge = Extension.create({
  name: 'mathPopover',
  addOptions() {
    return { getApi: () => null };
  },
  addStorage() {
    return { getApi: this.options.getApi };
  },
});
