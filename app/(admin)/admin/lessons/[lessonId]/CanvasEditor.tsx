// WYSIWYG lesson canvas.
//
// A single vertical canvas that renders every block the way a learner
// sees it (via BlockCard → BlockPreview), with inline editing,
// drag-to-reorder, and inserters between cards. Replaces the old
// three-pane outline + JSON editor.
//
// State model (all client-side, mirrors the old EditorClient so the
// server contract is unchanged):
//
//   blocks          — ordered list; each item is { id, block_type,
//                     sort_order, content }. `id` is the dnd key and
//                     the validator's branch-resolution id.
//   editingId       — the one block whose inline editor is expanded
//                     (null = all collapsed).
//   savedSnapshot   — JSON of the last-saved list; drives the dirty
//                     badge. Reset on successful save / discard.
//
// Save serialises `blocks` and posts to saveLessonBlocks, which
// re-validates server-side before any DB write — same action the old
// editor used.

'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/lib/ui/Button';
import {
  createStarterBlock,
  duplicateBlock,
  recomputeSortOrders,
} from '@/lib/lesson/editor-utils.mjs';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';
import { BlockCard } from './BlockCard';
import { AddBlockMenu } from './AddBlockMenu';
import type { LessonBlockType } from './block-meta';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

type Block = {
  id?: string;
  block_type?: string;
  sort_order?: number;
  content?: Record<string, unknown>;
};

let keyCounter = 0;
function ensureIds(blocks: Block[]): Block[] {
  return (blocks ?? []).map((b, i) => {
    const contentId = typeof b.content?.id === 'string' ? b.content.id : undefined;
    const id = b.id ?? contentId ?? `block_${Date.now()}_${keyCounter++}_${i}`;
    return { ...b, id, sort_order: i };
  });
}

export function CanvasEditor({
  lessonId,
  initialBlocks,
  action,
}: {
  lessonId: string;
  initialBlocks: Block[];
  // Server action — typed loosely to avoid coupling to the JS action's
  // signature; useActionState narrows it at the call site.
  action: (prev: unknown, formData: FormData) => Promise<unknown>;
}) {
  const [blocks, setBlocks] = useState<Block[]>(() => ensureIds(initialBlocks));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(ensureIds(initialBlocks)),
  );
  const [state, formAction, pending] = useActionState(action as never, null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // After a successful save the action returns ok:true; reset the
  // dirty snapshot so the unsaved badge clears.
  useEffect(() => {
    const s = state as { ok?: boolean } | null;
    if (s?.ok && !pending) setSavedSnapshot(JSON.stringify(blocks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(state as { ok?: boolean } | null)?.ok, (state as { data?: { savedAt?: number } } | null)?.data?.savedAt]);

  const dirty = useMemo(() => JSON.stringify(blocks) !== savedSnapshot, [blocks, savedSnapshot]);

  // Live validation so branch-reference / schema problems show on the
  // offending card before save.
  const validation = useMemo(() => {
    const list = blocks.map((b, i) => ({ ...b, id: b.id ?? b.content?.id ?? `index:${i}` }));
    return validateLessonBlocks(list);
  }, [blocks]);

  const issuesByBlock = useMemo(() => {
    const map: Record<string, Array<{ severity?: string; message?: string; path?: string }>> = {};
    for (const issue of [...validation.errors, ...validation.warnings]) {
      const id = issue.blockId ?? '';
      (map[id] ??= []).push(issue);
    }
    return map;
  }, [validation]);

  function commit(next: Block[]) {
    setBlocks(recomputeSortOrders(next));
  }

  function insertAt(type: LessonBlockType, index: number) {
    const starter = createStarterBlock(type, index) as Block;
    const next = [...blocks];
    next.splice(index, 0, starter);
    commit(next);
    setEditingId(starter.id ?? null);
  }

  function duplicateAt(index: number) {
    const copy = duplicateBlock(blocks[index], index + 1) as Block;
    const next = [...blocks];
    next.splice(index + 1, 0, copy);
    commit(next);
    setEditingId(copy.id ?? null);
  }

  function removeAt(index: number) {
    const removed = blocks[index];
    commit(blocks.filter((_, i) => i !== index));
    if (editingId === removed?.id) setEditingId(null);
  }

  function updateContentAt(index: number, content: Record<string, unknown>) {
    const next = [...blocks];
    next[index] = { ...next[index], content };
    setBlocks(next);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = blocks.findIndex((b) => b.id === active.id);
    const to = blocks.findIndex((b) => b.id === over.id);
    if (from === -1 || to === -1) return;
    commit(arrayMove(blocks, from, to));
  }

  function discard() {
    const restored = JSON.parse(savedSnapshot) as Block[];
    setBlocks(restored);
    setEditingId(null);
  }

  const saveState = state as { ok?: boolean; error?: string; data?: { blockCount?: number } } | null;

  return (
    <section className={a.section}>
      <div style={S.head}>
        <h2 className={a.h2}>Lesson canvas</h2>
        <div style={S.badges}>
          {dirty ? <span style={S.dirty}>Unsaved changes</span> : null}
          {!validation.ok ? (
            <span style={S.err}>
              {validation.summary.errorCount} error
              {validation.summary.errorCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {validation.summary.warningCount > 0 ? (
            <span style={S.warn}>
              {validation.summary.warningCount} warning
              {validation.summary.warningCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={blocks.map((b) => b.id as string)} strategy={verticalListSortingStrategy}>
          <div style={S.canvas}>
            <AddBlockMenu onPick={(type) => insertAt(type, 0)} label={blocks.length === 0 ? '+ Add your first block' : '+ Add block'} />
            {blocks.map((block, i) => (
              <div key={block.id}>
                <BlockCard
                  block={block}
                  index={i}
                  editing={editingId === block.id}
                  issues={issuesByBlock[block.id as string] ?? []}
                  onToggleEdit={() => setEditingId((cur) => (cur === block.id ? null : (block.id ?? null)))}
                  onChangeContent={(content) => updateContentAt(i, content)}
                  onDuplicate={() => duplicateAt(i)}
                  onDelete={() => removeAt(i)}
                />
                <AddBlockMenu onPick={(type) => insertAt(type, i + 1)} />
              </div>
            ))}
            {blocks.length === 0 ? (
              <p className={f.muted} style={{ textAlign: 'center', padding: 24 }}>
                This lesson has no blocks yet. Add your first block above.
              </p>
            ) : null}
          </div>
        </SortableContext>
      </DndContext>

      <form action={formAction} style={S.saveRow}>
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        <Button type="submit" variant="primary" disabled={pending || !validation.ok}>
          {pending ? 'Saving…' : 'Save lesson'}
        </Button>
        <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={discard}>
          Discard changes
        </Button>
        {saveState?.ok && !pending ? (
          <span className={f.ok}>Saved {saveState.data?.blockCount ?? 0} block(s).</span>
        ) : null}
        {saveState?.ok === false && !pending ? <span className={f.err}>{saveState.error}</span> : null}
      </form>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badges: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  canvas: { display: 'flex', flexDirection: 'column', gap: 4, margin: '12px 0' },

  saveRow: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    flexWrap: 'wrap',
    position: 'sticky',
    bottom: 0,
    background: 'var(--bg, var(--card))',
    paddingTop: 12,
    borderTop: '1px solid var(--border)',
  },

  dirty: pill('var(--color-diff-med-bg)', 'var(--color-diff-med-fg)', 'var(--color-diff-med-bd)'),
  err: pill('var(--color-danger-bg, #fee2e2)', 'var(--color-danger)', 'var(--color-danger)'),
  warn: pill('var(--color-diff-med-bg)', 'var(--color-diff-med-fg)', 'var(--color-diff-med-bd)'),
};

function pill(bg: string, color: string, border: string): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: bg,
    color,
    border: `1px solid ${border}`,
  };
}
