// One sortable card on the lesson canvas.
//
// Top: a header strip with the drag handle, the block-type label, and
// the per-block toolbar (Edit / Duplicate / Delete).
// Middle: the live read-only BlockPreview ("what the learner sees").
// Bottom (when editing): the structured BlockBodyEditor form, plus an
// "Advanced (JSON)" escape hatch for fields the form doesn't surface
// yet (branching / workflow metadata).
//
// Phase 1 reuses the existing BlockBodyEditor form for editing; Phase
// 2 replaces its internals with Tiptap, a question picker, etc. The
// card shell stays the same.

'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/lib/ui/Button';
import { BlockBodyEditor } from './BlockBodyEditor';
import { BlockPreview } from './BlockPreview';
import { blockMetaFor } from './block-meta';

type Issue = { severity?: string; message?: string; path?: string };

type Block = {
  id?: string;
  block_type?: string;
  content?: Record<string, unknown>;
};

export function BlockCard({
  block,
  index,
  editing,
  issues,
  onToggleEdit,
  onChangeContent,
  onDuplicate,
  onDelete,
}: {
  block: Block;
  index: number;
  editing: boolean;
  issues: Issue[];
  onToggleEdit: () => void;
  onChangeContent: (nextContent: Record<string, unknown>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id as string,
  });
  const meta = blockMetaFor(block.block_type);
  const hasError = issues.some((i) => i.severity === 'error');

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    ...S.card,
    ...(editing ? S.cardEditing : null),
    ...(hasError ? S.cardError : null),
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={S.head}>
        <button
          type="button"
          aria-label="Drag to reorder"
          style={S.handle}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <span style={S.index}>{index + 1}</span>
        <span style={S.icon}>{meta.icon}</span>
        <span style={S.label}>{meta.label}</span>
        {hasError ? <span style={S.errBadge}>needs attention</span> : null}
        <div style={S.toolbar}>
          <Button type="button" variant={editing ? 'primary' : 'secondary'} size="sm" onClick={onToggleEdit}>
            {editing ? 'Done' : 'Edit'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onDuplicate}>
            Duplicate
          </Button>
          <Button type="button" variant="remove" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      <div style={S.body}>
        <BlockPreview block={block} />
      </div>

      {editing ? (
        <div style={S.editor}>
          <BlockBodyEditor block={block} onChange={onChangeContent} />
          <AdvancedJson content={block.content ?? {}} onChange={onChangeContent} />
        </div>
      ) : null}

      {issues.length > 0 ? (
        <ul style={S.issues}>
          {issues.map((issue, i) => (
            <li key={i} style={issue.severity === 'error' ? S.issueErr : S.issueWarn}>
              {issue.path ? <code>{issue.path}: </code> : null}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// Escape hatch for content fields the structured form doesn't cover
// (branching targets, workflow metadata). Collapsed by default so the
// canvas stays friendly; opening it shows the raw block content JSON.
function AdvancedJson({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState(() => JSON.stringify(content ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);

  function onEdit(text: string) {
    setDraft(text);
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <details style={S.advanced}>
      <summary style={S.advancedSummary}>Advanced (raw JSON)</summary>
      <textarea
        value={draft}
        spellCheck={false}
        onChange={(e) => onEdit(e.target.value)}
        style={S.textarea}
      />
      {error ? <div style={S.jsonErr}>JSON error: {error}</div> : null}
    </details>
  );
}

const S: Record<string, React.CSSProperties> = {
  card: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg, 12px)',
    background: 'var(--card)',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardEditing: { borderColor: 'var(--color-app-accent)', boxShadow: '0 0 0 1px var(--color-app-accent)' },
  cardError: { borderColor: 'var(--color-danger)' },

  head: { display: 'flex', alignItems: 'center', gap: 8 },
  handle: {
    cursor: 'grab',
    border: 'none',
    background: 'transparent',
    color: 'var(--fg3)',
    fontSize: 16,
    lineHeight: 1,
    padding: '2px 4px',
    touchAction: 'none',
  },
  index: {
    minWidth: 20,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--fg3)',
    fontVariantNumeric: 'tabular-nums',
  },
  icon: { fontSize: 16, lineHeight: 1 },
  label: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-navy-900)',
  },
  errBadge: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    borderRadius: 'var(--radius-pill)',
    padding: '1px 8px',
  },
  toolbar: { marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' },

  body: { padding: '2px 4px 0 32px' },

  editor: {
    marginLeft: 32,
    padding: 12,
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-white, var(--card))',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  advanced: { marginTop: 4 },
  advancedSummary: { cursor: 'pointer', fontSize: 12, color: 'var(--fg3)', fontWeight: 600 },
  textarea: {
    marginTop: 8,
    width: '100%',
    minHeight: 180,
    fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)',
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre',
    overflow: 'auto',
    resize: 'vertical',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 8,
  },
  jsonErr: { color: 'var(--color-danger)', fontSize: 12, marginTop: 4 },

  issues: {
    listStyle: 'disc',
    margin: '0 0 0 32px',
    paddingLeft: 18,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  issueErr: { color: 'var(--color-danger)', fontSize: 12 },
  issueWarn: { color: 'var(--color-diff-med-fg)', fontSize: 12 },
};
