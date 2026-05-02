// Walks the editor doc and writes each math node's `latex` attribute
// directly from its live `<math-field>` element. Called from the
// save handler so the persisted doc always reflects what the user
// sees, regardless of whether MathLive's `input` events fired (some
// MathLive versions emit on a microtask boundary; others bundle
// keystrokes into one batch when the soft keyboard inserts a
// template). Walking the DOM at save time is the only fully
// reliable read.

import type { Editor } from '@tiptap/react';

export function syncMathNodesFromDom(editor: Editor): void {
  const { state, view } = editor;

  // Collect updates first; mutating the doc inside descendants() while
  // iterating would invalidate the positions the walk relies on.
  const updates: Array<{ pos: number; latex: string }> = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'math') return true;

    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom) return false;
    // The node-view wrapper is a span; the math-field is its direct
    // child. querySelector handles either nesting depth.
    const field = dom.querySelector('math-field') as HTMLElement | null;
    if (!field) return false;
    const live = (field as unknown as { value?: string }).value ?? '';
    if (live !== node.attrs.latex) {
      updates.push({ pos, latex: live });
    }
    return false; // atom node — no need to recurse further
  });

  if (updates.length === 0) return;

  let tr = state.tr;
  for (const u of updates) {
    const node = tr.doc.nodeAt(u.pos);
    if (!node) continue;
    tr = tr.setNodeMarkup(u.pos, undefined, { ...node.attrs, latex: u.latex });
  }
  if (tr.docChanged) {
    view.dispatch(tr);
  }
}
