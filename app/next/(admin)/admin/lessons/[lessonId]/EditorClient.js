// Per-lesson editor client. Three surfaces in one component:
//
//   1. Metadata form  — title / description / status / visibility.
//   2. Block editor   — list with reorder/dup/delete/add, plus a
//                       JSON editor for the selected block's content.
//   3. Danger zone    — delete the whole lesson (typed confirm).
//
// All mutations go through Server Actions. The block editor keeps
// blocks in local state; "Save blocks" serialises the list and
// posts it to saveLessonBlocks, which re-validates server-side
// before any DB write. The unsaved-changes guard compares the
// local list to the last-saved snapshot — flips back to clean on
// successful save and on revert.

'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import {
  createStarterBlock,
  duplicateBlock,
  getBlockLabel,
  recomputeSortOrders,
  updateBlockContentFromDraft,
} from '@/lib/lesson/editor-utils.mjs';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';
import { BlockBodyEditor } from './BlockBodyEditor';
import a from '../../../admin.module.css';
import f from '../../../forms.module.css';

export function EditorClient({ lesson, initialBlocks, actions }) {
  return (
    <div style={S.col}>
      <MetadataSection lesson={lesson} action={actions.updateMetadata} />
      <BlocksSection
        lessonId={lesson.id}
        initialBlocks={initialBlocks}
        action={actions.saveBlocks}
      />
      <DangerZone lessonId={lesson.id} action={actions.deleteLesson} />
    </div>
  );
}

// ─── Metadata ────────────────────────────────────────────────────

function MetadataSection({ lesson, action }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className={a.section}>
      <h2 className={a.h2}>Metadata</h2>
      <form action={formAction} className={f.form}>
        <input type="hidden" name="lesson_id" value={lesson.id} />

        <label className={f.label}>
          <span className={f.labelText}>Title</span>
          <input
            type="text"
            name="title"
            defaultValue={lesson.title ?? ''}
            className={f.input}
            required
          />
        </label>

        <label className={f.label}>
          <span className={f.labelText}>Description</span>
          <input
            type="text"
            name="description"
            defaultValue={lesson.description ?? ''}
            className={f.input}
          />
        </label>

        <div className={f.grid}>
          <label className={f.label}>
            <span className={f.labelText}>Status</span>
            <select
              name="status"
              defaultValue={lesson.status ?? 'draft'}
              className={f.select}
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label className={f.label}>
            <span className={f.labelText}>Visibility</span>
            <select
              name="visibility"
              defaultValue={lesson.visibility ?? 'shared'}
              className={f.select}
            >
              <option value="shared">shared</option>
              <option value="private">private</option>
            </select>
          </label>
        </div>

        <div className={f.actions}>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save metadata'}
          </Button>
          {state?.ok && !pending && <span className={f.ok}>Saved.</span>}
          {state?.ok === false && !pending && (
            <span className={f.err}>{state.error}</span>
          )}
        </div>
      </form>
    </section>
  );
}

// ─── Blocks ──────────────────────────────────────────────────────

function BlocksSection({ lessonId, initialBlocks, action }) {
  const [blocks, setBlocks] = useState(() => recomputeSortOrders(initialBlocks));
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [jsonDraft, setJsonDraft] = useState(() =>
    JSON.stringify(initialBlocks[0]?.content ?? {}, null, 2),
  );
  const [jsonError, setJsonError] = useState(null);
  const [editorMode, setEditorMode] = useState('form');
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(recomputeSortOrders(initialBlocks)),
  );
  const [state, formAction, pending] = useActionState(action, null);

  // After a successful save the server returns ok:true; reset the
  // dirty snapshot so the unsaved badge clears.
  useEffect(() => {
    if (state?.ok && !pending) {
      setSavedSnapshot(JSON.stringify(blocks));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok, state?.data?.savedAt]);

  const dirty = useMemo(
    () => JSON.stringify(blocks) !== savedSnapshot,
    [blocks, savedSnapshot],
  );

  // Validate everything live so the user sees branch-reference and
  // workflow problems before they hit save.
  const validation = useMemo(() => {
    const list = blocks.map((b, i) => ({
      ...b,
      id: b.id ?? b.content?.id ?? `index:${i}`,
    }));
    return validateLessonBlocks(list);
  }, [blocks]);

  const selected = blocks[selectedIndex] ?? null;

  function selectIndex(i) {
    if (i < 0 || i >= blocks.length) return;
    setSelectedIndex(i);
    setJsonDraft(JSON.stringify(blocks[i]?.content ?? {}, null, 2));
    setJsonError(null);
  }

  function onJsonChange(text) {
    setJsonDraft(text);
    const result = updateBlockContentFromDraft(blocks, selectedIndex, text);
    if (result.error) {
      setJsonError(result.error);
      return;
    }
    setJsonError(null);
    setBlocks(result.blocks);
  }

  // Form-mode edits write a structured content object straight into
  // the block, and keep the JSON draft in sync so toggling to the
  // JSON tab shows the same thing.
  function onContentChange(nextContent) {
    const next = [...blocks];
    next[selectedIndex] = { ...next[selectedIndex], content: nextContent };
    setBlocks(next);
    setJsonDraft(JSON.stringify(nextContent ?? {}, null, 2));
    setJsonError(null);
  }

  // Changing a block's type resets its content to a starter for the
  // new type (same behavior as the legacy editor) so the form has a
  // valid shape to render.
  function onChangeType(nextType) {
    const selected = blocks[selectedIndex];
    if (!selected || nextType === selected.block_type) return;
    if (
      !confirm(
        `Change this block to "${nextType}"? Its content will be reset to a ${nextType} starter.`,
      )
    ) {
      return;
    }
    const starter = createStarterBlock(nextType, selectedIndex);
    const next = [...blocks];
    next[selectedIndex] = {
      ...next[selectedIndex],
      block_type: nextType,
      content: starter.content,
    };
    setBlocks(next);
    setJsonDraft(JSON.stringify(starter.content ?? {}, null, 2));
    setJsonError(null);
    setEditorMode('form');
  }

  function addBlock(type) {
    const next = recomputeSortOrders([
      ...blocks,
      createStarterBlock(type, blocks.length),
    ]);
    setBlocks(next);
    selectIndexAfter(next, next.length - 1);
  }

  function dupeSelected() {
    if (!selected) return;
    const copy = duplicateBlock(selected, selectedIndex + 1);
    const next = recomputeSortOrders([
      ...blocks.slice(0, selectedIndex + 1),
      copy,
      ...blocks.slice(selectedIndex + 1),
    ]);
    setBlocks(next);
    selectIndexAfter(next, selectedIndex + 1);
  }

  function deleteSelected() {
    if (!selected) return;
    const next = recomputeSortOrders(blocks.filter((_, i) => i !== selectedIndex));
    setBlocks(next);
    const nextIndex = Math.min(selectedIndex, next.length - 1);
    selectIndexAfter(next, Math.max(0, nextIndex));
  }

  function moveSelected(delta) {
    const target = selectedIndex + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[selectedIndex], next[target]] = [next[target], next[selectedIndex]];
    const reordered = recomputeSortOrders(next);
    setBlocks(reordered);
    selectIndexAfter(reordered, target);
  }

  function selectIndexAfter(nextBlocks, i) {
    setSelectedIndex(i);
    setJsonDraft(JSON.stringify(nextBlocks[i]?.content ?? {}, null, 2));
    setJsonError(null);
  }

  function revert() {
    const restored = JSON.parse(savedSnapshot);
    setBlocks(restored);
    setSelectedIndex(0);
    setJsonDraft(JSON.stringify(restored[0]?.content ?? {}, null, 2));
    setJsonError(null);
  }

  return (
    <section className={a.section}>
      <div style={S.blocksHead}>
        <h2 className={a.h2}>Blocks ({blocks.length})</h2>
        <div style={S.blocksHeadRight}>
          {dirty && <span style={S.dirtyPill}>Unsaved changes</span>}
          {!validation.ok && (
            <span style={S.errPill}>
              {validation.summary.errorCount} validation error
              {validation.summary.errorCount === 1 ? '' : 's'}
            </span>
          )}
          {validation.summary.warningCount > 0 && (
            <span style={S.warnPill}>
              {validation.summary.warningCount} warning
              {validation.summary.warningCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <div style={S.split}>
        <BlockList
          blocks={blocks}
          selectedIndex={selectedIndex}
          onSelect={selectIndex}
          onAdd={addBlock}
          onMove={moveSelected}
          onDuplicate={dupeSelected}
          onDelete={deleteSelected}
        />

        <div style={S.editor}>
          {selected ? (
            <BlockEditor
              block={selected}
              jsonDraft={jsonDraft}
              jsonError={jsonError}
              onJsonChange={onJsonChange}
              onContentChange={onContentChange}
              onChangeType={onChangeType}
              editorMode={editorMode}
              onSetMode={setEditorMode}
              validation={validation}
            />
          ) : (
            <p className={f.muted}>
              No blocks yet. Use the buttons on the left to add one, or
              import a lesson from JSON.
            </p>
          )}
        </div>
      </div>

      <form action={formAction} style={S.saveRow}>
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
        <Button
          type="submit"
          variant="primary"
          disabled={pending || jsonError !== null || !validation.ok}
        >
          {pending ? 'Saving…' : 'Save blocks'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!dirty || pending}
          onClick={revert}
        >
          Discard changes
        </Button>
        {state?.ok && !pending && (
          <span className={f.ok}>
            Saved {state.data?.blockCount ?? 0} block(s).
          </span>
        )}
        {state?.ok === false && !pending && (
          <span className={f.err}>{state.error}</span>
        )}
        {jsonError && <span className={f.err}>JSON error: {jsonError}</span>}
      </form>
    </section>
  );
}

function BlockList({ blocks, selectedIndex, onSelect, onAdd, onMove, onDuplicate, onDelete }) {
  return (
    <div style={S.list}>
      <div style={S.listHead}>
        <Button type="button" variant="secondary" size="sm" onClick={() => onAdd('text')}>
          + Text
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onAdd('video')}>
          + Video
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onAdd('check')}>
          + Check
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onAdd('question_link')}>
          + Question
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onAdd('desmos_interactive')}
        >
          + Desmos
        </Button>
      </div>
      <ol style={S.listBody}>
        {blocks.map((block, i) => {
          const active = i === selectedIndex;
          return (
            <li key={block.id ?? i}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                style={{ ...S.row, ...(active ? S.rowActive : null) }}
              >
                <span style={S.rowIndex}>{i + 1}.</span>
                <span style={S.rowMain}>
                  <span style={S.rowType}>{block.block_type}</span>
                  <span style={S.rowLabel}>{getBlockLabel(block)}</span>
                </span>
              </button>
            </li>
          );
        })}
        {blocks.length === 0 && (
          <li>
            <p className={f.muted} style={{ padding: 8 }}>
              No blocks yet.
            </p>
          </li>
        )}
      </ol>
      {blocks.length > 0 && (
        <div style={S.listFoot}>
          <Button type="button" variant="secondary" size="sm" onClick={() => onMove(-1)}>
            ↑ Up
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => onMove(1)}>
            ↓ Down
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button type="button" variant="remove" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

function BlockEditor({
  block,
  jsonDraft,
  jsonError,
  onJsonChange,
  onContentChange,
  onChangeType,
  editorMode,
  onSetMode,
  validation,
}) {
  const blockId = block?.id ?? block?.content?.id ?? null;
  const blockIssues = [
    ...validation.errors.filter((e) => e.blockId === blockId),
    ...validation.warnings.filter((w) => w.blockId === blockId),
  ];

  return (
    <div style={S.col}>
      <div style={S.editorHead}>
        <span style={S.editorType}>{block.block_type}</span>
        <code style={S.editorId}>{blockId ?? '—'}</code>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Button
            type="button"
            variant={editorMode === 'form' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => onSetMode('form')}
          >
            Form
          </Button>
          <Button
            type="button"
            variant={editorMode === 'json' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => onSetMode('json')}
          >
            JSON
          </Button>
        </div>
      </div>

      <label className={f.label} style={{ maxWidth: 240 }}>
        <span className={f.labelText}>Block type</span>
        <select
          className={f.select}
          value={block.block_type}
          onChange={(e) => onChangeType(e.target.value)}
        >
          <option value="text">text</option>
          <option value="video">video</option>
          <option value="check">check</option>
          <option value="question_link">question_link</option>
          <option value="desmos_interactive">desmos_interactive</option>
        </select>
      </label>

      {editorMode === 'form' ? (
        <BlockBodyEditor block={block} onChange={onContentChange} />
      ) : (
        <label className={f.label}>
          <span className={f.labelText}>Block content (JSON)</span>
          <textarea
            value={jsonDraft}
            onChange={(e) => onJsonChange(e.target.value)}
            spellCheck={false}
            className={f.input}
            style={S.textarea}
          />
        </label>
      )}
      {jsonError && (
        <div style={S.errorBox}>JSON parse error: {jsonError}</div>
      )}
      {blockIssues.length > 0 && (
        <div>
          <div style={S.issuesHead}>Issues for this block</div>
          <ul style={S.issuesList}>
            {blockIssues.map((issue, idx) => (
              <li
                key={idx}
                style={issue.severity === 'error' ? S.issueErr : S.issueWarn}
              >
                {issue.path && <code>{issue.path}: </code>}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Danger zone ─────────────────────────────────────────────────

function DangerZone({ lessonId, action }) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <section className={a.section} style={S.danger}>
      <h2 className={a.h2}>Danger zone</h2>
      <p className={f.formHint}>
        Deleting a lesson cascades to its blocks, assignments, and student
        progress. Type <code>DELETE</code> to confirm.
      </p>
      <form action={formAction} className={f.row}>
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input
          type="text"
          name="confirm"
          placeholder="DELETE"
          className={f.input}
          style={{ maxWidth: 160 }}
        />
        <Button type="submit" variant="remove" disabled={pending}>
          {pending ? 'Deleting…' : 'Delete lesson'}
        </Button>
        {state?.ok === false && !pending && (
          <span className={f.err}>{state.error}</span>
        )}
      </form>
    </section>
  );
}

// ─── Styles ──────────────────────────────────────────────────────

const S = {
  col: { display: 'flex', flexDirection: 'column', gap: 16 },

  blocksHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  blocksHeadRight: { display: 'flex', gap: 6, flexWrap: 'wrap' },

  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
    gap: 16,
    alignItems: 'flex-start',
  },

  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 8,
    background: 'var(--card)',
  },
  listHead: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  listBody: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    maxHeight: 480,
    overflow: 'auto',
  },
  listFoot: { display: 'flex', gap: 4, flexWrap: 'wrap' },

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: 12,
    color: 'var(--fg1)',
  },
  rowActive: {
    background: 'var(--color-app-accent-bg, var(--bg-white))',
    borderColor: 'var(--color-app-accent)',
  },
  rowIndex: { color: 'var(--fg3)', minWidth: 24, textAlign: 'right' },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  rowType: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-navy-900)',
  },
  rowLabel: {
    color: 'var(--fg3)',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  editor: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 12,
    minHeight: 320,
  },
  editorHead: {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline',
    paddingBottom: 6,
    borderBottom: '1px solid var(--border)',
    marginBottom: 8,
  },
  editorType: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-navy-900)',
  },
  editorId: { fontSize: 11, color: 'var(--fg3)' },
  textarea: {
    minHeight: 360,
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre',
    overflow: 'auto',
    resize: 'vertical',
  },
  errorBox: {
    background: 'var(--color-danger-bg, #fee2e2)',
    color: 'var(--color-danger)',
    padding: 8,
    borderRadius: 6,
    fontSize: 12,
  },
  issuesHead: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--fg3)',
    marginTop: 8,
    marginBottom: 4,
  },
  issuesList: {
    listStyle: 'disc',
    margin: 0,
    paddingLeft: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  issueErr: { color: 'var(--color-danger)', fontSize: 12 },
  issueWarn: { color: 'var(--color-diff-med-fg)', fontSize: 12 },

  saveRow: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' },

  dirtyPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: 'var(--color-diff-med-bg)',
    color: 'var(--color-diff-med-fg)',
    border: '1px solid var(--color-diff-med-bd)',
  },
  errPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: 'var(--color-danger-bg, #fee2e2)',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
  },
  warnPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 10px',
    borderRadius: 'var(--radius-pill)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    background: 'var(--color-diff-med-bg)',
    color: 'var(--color-diff-med-fg)',
    border: '1px solid var(--color-diff-med-bd)',
  },

  danger: { borderColor: 'var(--color-danger)' },
};
