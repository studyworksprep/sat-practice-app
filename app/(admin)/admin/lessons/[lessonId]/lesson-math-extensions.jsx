'use client';

// TipTap math nodes for the lesson text editor.
//
// These mirror the question authoring editor's math nodes, with one
// crucial difference: the lesson editor stores editor.getHTML()
// verbatim as the block's content.html, and that HTML is later
// rendered by MathJax (HtmlBlock at runtime, useMathTypeset in the
// preview). So unlike the question nodes — which serialise to empty
// data-latex atoms and run through a separate bank-HTML serializer —
// these serialise the equation as visible \( … \) / \[ … \] text that
// MathJax can typeset directly, while keeping data-latex so the node
// round-trips back into the editor on the next edit.
//
//   mathInline : inline atom → <span data-math-inline data-latex>\(…\)</span>
//   mathBlock  : block atom  → <div  data-math-block  data-latex>\[…\]</div>
//
// In the editor the equation is drawn with KaTeX (fast, self-
// contained); clicking a node opens the host editor's MathLive popover
// through the same storage bridge the question editor uses.

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

// Pull the LaTeX back out of \( … \) / \[ … \] text when data-latex is
// missing (e.g. content that round-tripped through the sanitizer).
function stripDelimiters(text) {
  const t = String(text || '').trim();
  const m = t.match(/^\\\((.*)\\\)$/s) || t.match(/^\\\[(.*)\\\]$/s) || t.match(/^\$\$(.*)\$\$$/s);
  return m ? m[1].trim() : '';
}

function openEditor(editor, pos, latex, display) {
  const api = editor?.storage?.mathPopover?.getApi?.();
  if (typeof api === 'function') api({ pos, latex, display });
}

function MathInlineView({ node, editor, getPos }) {
  const latex = node.attrs.latex || '';
  const html = renderKatex(latex, false);
  return (
    <NodeViewWrapper
      as="span"
      className="sw-math-inline"
      style={{ cursor: 'pointer' }}
      onClick={() => openEditor(editor, getPos(), latex, false)}
      title="Click to edit equation"
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span>{latex || 'equation'}</span>
      )}
    </NodeViewWrapper>
  );
}

function MathBlockView({ node, editor, getPos }) {
  const latex = node.attrs.latex || '';
  const html = renderKatex(latex, true);
  return (
    <NodeViewWrapper
      className="sw-math-block"
      style={{ cursor: 'pointer', textAlign: 'center', margin: '8px 0' }}
      onClick={() => openEditor(editor, getPos(), latex, true)}
      title="Click to edit equation"
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span>{latex || 'equation'}</span>
      )}
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
        parseHTML: (el) => el.getAttribute('data-latex') || stripDelimiters(el.textContent),
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-math-inline]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const latex = node.attrs.latex || '';
    return ['span', mergeAttributes(HTMLAttributes, { 'data-math-inline': '' }), `\\(${latex}\\)`];
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
        parseHTML: (el) => el.getAttribute('data-latex') || stripDelimiters(el.textContent),
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex || '' }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-math-block]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const latex = node.attrs.latex || '';
    return ['div', mergeAttributes(HTMLAttributes, { 'data-math-block': '' }), `\\[${latex}\\]`];
  },
  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
});

// Storage bridge so the out-of-tree node views can ask the host editor
// to open its MathLive popover. Same pattern as the question editor.
export const MathPopoverBridge = Extension.create({
  name: 'mathPopover',
  addOptions() {
    return { getApi: () => null };
  },
  addStorage() {
    return { getApi: this.options.getApi };
  },
});
