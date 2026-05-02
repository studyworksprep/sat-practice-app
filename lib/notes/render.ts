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
 *  raw LaTeX so search hits "frac" inside `\frac{1}{2}`. */
export function docToPlainText(doc: NoteDoc): string {
  if (!doc || typeof doc !== 'object') return '';
  let out = '';
  const walk = (node: DocNode | undefined) => {
    if (!node) return;
    if (typeof node.text === 'string') out += node.text;
    if (node.type === 'math' && node.attrs && typeof node.attrs.latex === 'string') {
      out += ` ${node.attrs.latex} `;
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
