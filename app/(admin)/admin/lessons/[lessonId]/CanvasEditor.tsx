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
import { LessonSlideshow } from '@/lib/ui/LessonSlideshow';
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

// LessonSlideshow is untyped JS (its `blocks` default makes TS infer
// never[]); alias it with the prop shape we actually pass.
const Slideshow = LessonSlideshow as unknown as (props: {
  blocks: Block[];
  questionLinkHref: string | null;
  showCompleteButton?: boolean;
}) => React.ReactElement;

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
  const [view, setView] = useState<'edit' | 'preview'>('edit');
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

  const indexById = useMemo(() => {
    const map: Record<string, number> = {};
    blocks.forEach((b, i) => {
      if (b.id) map[b.id] = i;
    });
    return map;
  }, [blocks]);

  // Warn before leaving with unsaved edits — the save is a full
  // replace, so a lost tab loses the whole working set.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function jumpToBlock(id: string) {
    setView('edit');
    setEditingId(id);
    requestAnimationFrame(() => {
      document.getElementById(`block-anchor-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

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
          <div style={S.viewToggle}>
            <Button type="button" variant={view === 'edit' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('edit')}>
              Edit
            </Button>
            <Button type="button" variant={view === 'preview' ? 'primary' : 'secondary'} size="sm" onClick={() => setView('preview')}>
              Preview as student
            </Button>
          </div>
        </div>
      </div>

      {view === 'edit' ? (
        <ValidationSummary validation={validation} indexById={indexById} onJump={jumpToBlock} />
      ) : null}

      {view === 'preview' ? (
        <div style={S.preview}>
          {blocks.length === 0 ? (
            <p className={f.muted} style={{ textAlign: 'center', padding: 24 }}>
              Nothing to preview yet — add a block first.
            </p>
          ) : (
            <Slideshow blocks={blocks} questionLinkHref={null} showCompleteButton={false} />
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={blocks.map((b) => b.id as string)} strategy={verticalListSortingStrategy}>
            <div style={S.canvas}>
              <AddBlockMenu onPick={(type) => insertAt(type, 0)} label={blocks.length === 0 ? '+ Add your first block' : '+ Add block'} />
              {blocks.map((block, i) => (
                <div key={block.id} id={`block-anchor-${block.id}`}>
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
      )}

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

type Issue = {
  severity?: string;
  message?: string;
  blockId?: string;
  path?: string;
  suggestion?: string;
};

// Lesson-wide list of validation issues, each linking to its block.
// Errors first, then warnings; an issue whose blockId can't be
// resolved to a current block (e.g. a branch target pointing at a
// deleted id) is shown without a jump link.
function ValidationSummary({
  validation,
  indexById,
  onJump,
}: {
  validation: { errors?: Issue[]; warnings?: Issue[] };
  indexById: Record<string, number>;
  onJump: (id: string) => void;
}) {
  const errors = validation.errors ?? [];
  const warnings = validation.warnings ?? [];
  if (errors.length === 0 && warnings.length === 0) return null;
  const all = [...errors, ...warnings];

  return (
    <div style={S.summary}>
      <div style={S.summaryHead}>
        Validation — {errors.length} error{errors.length === 1 ? '' : 's'}, {warnings.length} warning
        {warnings.length === 1 ? '' : 's'}
      </div>
      <ul style={S.summaryList}>
        {all.map((issue, i) => {
          const idx = issue.blockId != null ? indexById[issue.blockId] : undefined;
          const isErr = issue.severity === 'error';
          return (
            <li key={i} style={S.summaryItem}>
              <button
                type="button"
                disabled={idx == null}
                onClick={() => issue.blockId && onJump(issue.blockId)}
                style={{ ...S.jumpBtn, ...(idx == null ? S.jumpBtnDisabled : null) }}
              >
                {idx != null ? `Block ${idx + 1}` : 'Lesson'}
              </button>
              <span style={isErr ? S.issueErrText : S.issueWarnText}>{issue.message}</span>
              {issue.suggestion ? <span style={S.issueSuggest}>{issue.suggestion}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  badges: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  viewToggle: { display: 'flex', gap: 4, marginLeft: 8 },
  canvas: { display: 'flex', flexDirection: 'column', gap: 4, margin: '12px 0' },
  preview: {
    margin: '12px 0',
    padding: 16,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg, 12px)',
    background: 'var(--bg-white, var(--card))',
  },

  summary: {
    margin: '12px 0',
    border: '1px solid var(--color-diff-med-bd)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-diff-med-bg)',
    padding: 10,
  },
  summaryHead: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-diff-med-fg)',
    marginBottom: 6,
  },
  summaryList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  summaryItem: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12 },
  jumpBtn: {
    flexShrink: 0,
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-pill)',
    background: 'var(--card)',
    padding: '0 8px',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-app-accent)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  jumpBtnDisabled: { color: 'var(--fg3)', cursor: 'default' },
  issueErrText: { color: 'var(--color-danger)' },
  issueWarnText: { color: 'var(--color-diff-med-fg)' },
  issueSuggest: { color: 'var(--fg3)', fontStyle: 'italic' },

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
