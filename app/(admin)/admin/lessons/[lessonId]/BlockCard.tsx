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
import { RichTextEditor } from './RichTextEditor';
import { QuestionPicker } from './QuestionPicker';
import { DesmosEditor } from './DesmosEditor';
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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDuplicate}
            disabled={block.block_type === 'lesson_complete'}
          >
            Duplicate
          </Button>
          <Button type="button" variant="remove" size="sm" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </div>

      {editing ? (
        <div style={S.editGrid}>
          <div style={S.editPane}>
            <div style={S.paneLabel}>Edit</div>
            <div style={S.editInner}>
              <BlockBody block={block} onChangeContent={onChangeContent} />
              <AdvancedJson content={block.content ?? {}} onChange={onChangeContent} />
            </div>
          </div>
          <div style={S.previewPane}>
            <div style={S.previewBar}>
              <span aria-hidden>👁</span>
              <span>Preview</span>
              <span style={S.previewSub}>what the learner sees</span>
            </div>
            <div style={S.previewInner}>
              <BlockPreview block={block} />
            </div>
          </div>
        </div>
      ) : (
        <div style={S.body}>
          <BlockPreview block={block} />
        </div>
      )}

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

// Per-type editing surface. The rich text and practice-question
// blocks get their dedicated Phase 2 editors; everything else falls
// back to the shared structured form (BlockBodyEditor). All of them
// report a full replacement content object up to the canvas.
function BlockBody({
  block,
  onChangeContent,
}: {
  block: Block;
  onChangeContent: (next: Record<string, unknown>) => void;
}) {
  const content = (block.content ?? {}) as Record<string, unknown>;

  if (block.block_type === 'text') {
    return (
      <RichTextEditor
        html={typeof content.html === 'string' ? content.html : ''}
        onChange={(html) => onChangeContent({ ...content, html })}
      />
    );
  }

  if (block.block_type === 'question_link') {
    return <QuestionPicker content={content} onChange={onChangeContent} />;
  }

  if (block.block_type === 'desmos_interactive') {
    return <DesmosEditor content={content} onChange={onChangeContent} />;
  }

  if (block.block_type === 'lesson_complete') {
    return <LessonCompleteBodyEditor content={content} onChangeContent={onChangeContent} />;
  }

  return <BlockBodyEditor block={block} onChange={onChangeContent} />;
}

// Editor for the terminal lesson_complete block: rich closing message +
// the completion button's label.
function LessonCompleteBodyEditor({
  content,
  onChangeContent,
}: {
  content: Record<string, unknown>;
  onChangeContent: (next: Record<string, unknown>) => void;
}) {
  const buttonLabel = typeof content.button_label === 'string' ? content.button_label : 'Complete Lesson';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <RichTextEditor
        html={typeof content.html === 'string' ? content.html : ''}
        onChange={(html) => onChangeContent({ ...content, html })}
      />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg2)' }}>Button label</span>
        <input
          type="text"
          value={buttonLabel}
          onChange={(e) => onChangeContent({ ...content, button_label: e.target.value })}
          placeholder="Complete Lesson"
          style={{
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: 'inherit',
          }}
        />
      </label>
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

  // Editing: two responsive columns — the editor on the left, a
  // clearly outlined live "Preview" box on the right. Collapses to a
  // single column on narrow widths via auto-fit.
  editGrid: {
    marginTop: 10,
    paddingTop: 12,
    borderTop: '1px solid var(--border)',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 16,
    alignItems: 'start',
  },
  editPane: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 },
  editInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 12,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-white, var(--card))',
  },
  paneLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--fg3)',
  },
  previewPane: {
    minWidth: 0,
    border: '2px solid var(--color-app-accent)',
    borderRadius: 'var(--radius-lg, 12px)',
    overflow: 'hidden',
    background: 'var(--bg-white, #fff)',
    position: 'sticky',
    top: 12,
  },
  previewBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'var(--color-app-accent-bg, #eef)',
    borderBottom: '1px solid var(--color-app-accent)',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--color-navy-900)',
  },
  previewSub: {
    marginLeft: 'auto',
    fontWeight: 500,
    textTransform: 'none',
    letterSpacing: 0,
    color: 'var(--fg3)',
    fontSize: 11,
  },
  previewInner: { padding: 14 },

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
