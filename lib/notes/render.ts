// Helpers that walk a TipTap document. Used on the server to
// compute the body_text projection that fills the search index and
// powers index-page snippets, and on the client to seed the same
// projection on every save.
//
// Kept dependency-free (no @tiptap/core import) so it can run from
// Server Actions without pulling the editor bundle into the server
// runtime.

import type { NoteDoc } from '@/lib/types';

interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'horizontalRule',
]);

/** Flatten a TipTap doc to plain text. Math nodes contribute their
 *  raw LaTeX so search hits "frac" inside `\frac{1}{2}`; drawing
 *  nodes contribute a `[drawing]` token so a search for the word
 *  "drawing" still finds notes that contain one. */
export function docToPlainText(doc: NoteDoc): string {
  if (!doc || typeof doc !== 'object') return '';
  let out = '';
  const walk = (node: DocNode | undefined) => {
    if (!node) return;
    if (typeof node.text === 'string') out += node.text;
    if (node.type === 'math' && node.attrs && typeof node.attrs.latex === 'string') {
      out += ` ${node.attrs.latex} `;
    }
    if (node.type === 'excalidraw') {
      out += ' [drawing] ';
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
    if (node.type && BLOCK_TYPES.has(node.type)) {
      out += '\n';
    }
  };
  walk(doc as DocNode);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Default empty TipTap doc — a single empty paragraph. Returned by
 *  the page when no note exists yet, so the editor mounts cleanly. */
export const EMPTY_DOC: NoteDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
} as unknown as NoteDoc;

// ──────────────────────────────────────────────────────────────
// Snippet HTML — same walk as docToPlainText, but emits HTML with
// MathJax-friendly inline delimiters around math nodes so the
// global MathJax instance loaded in app/layout.js can typeset them
// on mount. Used by the /notes index page so each card shows
// rendered math instead of raw LaTeX.
// ──────────────────────────────────────────────────────────────

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(HTML_ESCAPE_RE, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

interface SnippetState {
  out: string;
  /** Visible character budget — block separators and math nodes
   *  count toward this so a doc full of equations still truncates. */
  visible: number;
  truncated: boolean;
  maxLen: number;
}

const MATH_VISIBLE_WEIGHT = 6;
const DRAWING_VISIBLE_WEIGHT = 12;

/** Walk a TipTap doc and emit an HTML snippet suitable for inline
 *  preview cards. Math nodes become `\\(latex\\)` so MathJax can
 *  typeset them; everything else is HTML-escaped plain text with a
 *  single space between block elements. */
export function docToSnippetHtml(doc: NoteDoc, maxLen = 240): string {
  if (!doc || typeof doc !== 'object') return '';
  const state: SnippetState = { out: '', visible: 0, truncated: false, maxLen };
  appendNode(doc as DocNode, state);
  if (state.truncated) state.out += '…';
  return state.out.trim();
}

function appendNode(node: DocNode | undefined, state: SnippetState): void {
  if (!node || state.truncated) return;

  if (typeof node.text === 'string') {
    const remaining = state.maxLen - state.visible;
    if (remaining <= 0) {
      state.truncated = true;
      return;
    }
    let text = node.text;
    if (text.length > remaining) {
      text = text.slice(0, remaining);
      state.truncated = true;
    }
    state.out += escapeHtml(text);
    state.visible += text.length;
    return;
  }

  if (
    node.type === 'math' &&
    node.attrs &&
    typeof node.attrs.latex === 'string' &&
    node.attrs.latex.length > 0
  ) {
    if (state.visible >= state.maxLen) {
      state.truncated = true;
      return;
    }
    // The latex string itself isn't escaped: it goes inside `\(…\)`
    // delimiters that MathJax parses. The raw latex never reaches
    // the HTML parser as markup because MathJax extracts it before
    // the browser renders the surrounding text.
    state.out += '\\(' + node.attrs.latex + '\\)';
    state.visible += MATH_VISIBLE_WEIGHT;
    return;
  }

  if (node.type === 'excalidraw') {
    if (state.visible >= state.maxLen) {
      state.truncated = true;
      return;
    }
    // Cards intentionally don't embed the SVG: it would balloon the
    // payload of every notes-index render and the cards are
    // 200-char snippets, not preview thumbnails. A small inline
    // badge (matching the .miniLink style) makes the presence of
    // a drawing visible without rendering it.
    state.out += '<span class="snippet-drawing">[drawing]</span>';
    state.visible += DRAWING_VISIBLE_WEIGHT;
    return;
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      appendNode(child, state);
      if (state.truncated) break;
    }
  }

  if (node.type && BLOCK_TYPES.has(node.type)) {
    if (state.visible > 0 && !state.out.endsWith(' ')) {
      state.out += ' ';
    }
  }
}
