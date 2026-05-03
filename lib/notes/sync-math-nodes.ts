// Walks the editor doc and writes each math node's `latex` attribute
// directly from its live `<math-field>` element. Called from the
// save handler so the persisted doc reflects what the user sees,
// regardless of whether MathLive's `input` events fired in time.
//
// Defensive: if the live read comes back empty but the doc already
// has a non-empty latex, we trust the doc. A blank read almost
// always means the field was just blurred, not yet upgraded, or
// being torn down — none of those should clobber a real equation.

import type { Editor } from '@tiptap/react';
import { readMathFieldValue } from '@/app/next/(student)/notes/MathNode';

export function syncMathNodesFromDom(editor: Editor): void {
  const { state, view } = editor;

  const updates: Array<{ pos: number; latex: string }> = [];

  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'math') return true;

    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom) return false;
    const field = dom.querySelector('math-field') as HTMLElement | null;
    if (!field) return false;

    const live = readMathFieldValue(field);
    const docLatex = (node.attrs.latex as string) ?? '';

    // Skip empty live reads when the doc already has a value — the
    // empty almost always means we read mid-blur or pre-upgrade,
    // not that the user actually cleared the field.
    if (!live && docLatex) return false;

    if (live !== docLatex) {
      updates.push({ pos, latex: live });
    }
    return false;
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
