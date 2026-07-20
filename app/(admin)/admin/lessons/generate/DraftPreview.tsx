'use client';

// Read-only preview of an AI-generated lesson draft, shown between
// generation and the block editor. Deliberately non-interactive: the
// point is a big-picture read of the whole lesson (arc, tone, block
// mix) before anything is written to the DB. The only inputs are the
// feedback box — which sends the draft back through Claude for a
// revision — and the confirm / discard actions in the sticky footer.
//
// Block rendering reuses the editor's BlockPreview (the "what the
// learner sees" renderer), so the preview matches both the editor
// canvas and the student runtime.

import { useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { BlockPreview } from '../[lessonId]/BlockPreview';
import { blockMetaFor } from '../[lessonId]/block-meta';
import { DraftBlockBoundary } from './DraftBlockBoundary';
import f from '../../../forms.module.css';

export interface DraftBlock {
  sort_order: number;
  block_type: string;
  content: Record<string, unknown>;
}

interface ValidationIssue {
  blockId?: string | null;
  message?: string;
}

interface DraftPreviewProps {
  title: string;
  description: string | null;
  blocks: DraftBlock[];
  warnings: string[];
  /** graph_image blocks still rendering in the browser — saving is gated until 0. */
  pendingGraphCount: number;
  busy: 'idle' | 'revising' | 'saving';
  error: string | null;
  validationErrors: ValidationIssue[];
  onRequestChanges: (feedback: string) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function DraftPreview({
  title,
  description,
  blocks,
  warnings,
  pendingGraphCount,
  busy,
  error,
  validationErrors,
  onRequestChanges,
  onConfirm,
  onDiscard,
}: DraftPreviewProps) {
  const [feedback, setFeedback] = useState('');
  const isBusy = busy !== 'idle';
  const feedbackMissing = !feedback.trim();

  function handleDiscard() {
    if (window.confirm('Discard this draft? Nothing has been saved yet.')) {
      onDiscard();
    }
  }

  return (
    <div style={S.col}>
      <section style={S.headerCard}>
        <div style={S.eyebrow}>Draft preview · read-only</div>
        <h2 style={S.title}>{title}</h2>
        {description && <p style={S.description}>{description}</p>}
        <p style={S.metaLine}>
          {blocks.length} block{blocks.length === 1 ? '' : 's'} · not saved yet — review the
          lesson below, then request changes or continue to the editor.
        </p>
      </section>

      {warnings.length > 0 && (
        <section style={S.warnings}>
          <strong>Generation warnings</strong>
          <ul style={S.warningList}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <div style={{ ...S.blockList, ...(busy === 'revising' ? S.blockListBusy : null) }}>
        {blocks.map((block, i) => {
          const meta = blockMetaFor(block.block_type);
          // Generated video blocks have no URL yet (the admin sources
          // one in the editor); BlockPreview's empty state says "click
          // Edit", which is wrong here and hides the caption carrying
          // the video topic. Show the caption instead.
          const isVideoPlaceholder =
            block.block_type === 'video' && !String(block.content?.url ?? '').trim();
          return (
            <section key={`${i}-${String(block.content?.id ?? '')}`} style={S.blockCard}>
              <div style={S.blockLabel}>
                <span aria-hidden>{meta.icon}</span> {meta.label}
              </div>
              <DraftBlockBoundary blockType={block.block_type} blockIndex={i}>
                {isVideoPlaceholder ? (
                  <div style={S.videoPlaceholder}>
                    {String(block.content?.caption ?? '') ||
                      'Video placeholder — a URL is added in the editor.'}
                  </div>
                ) : (
                  <BlockPreview block={{ block_type: block.block_type, content: block.content }} />
                )}
              </DraftBlockBoundary>
            </section>
          );
        })}
      </div>

      <div style={S.footer}>
        <label className={f.label}>
          <span className={f.labelText}>Feedback for Claude</span>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={isBusy}
            className={f.input}
            style={S.feedbackArea}
            placeholder={
              'Anything off? e.g. "The second check is too easy", "Add a worked example for negative slopes", "Make the tone less chatty"…'
            }
          />
        </label>

        {error && (
          <div style={S.error}>
            <div>{error}</div>
            {validationErrors.length > 0 && (
              <ul style={S.errorList}>
                {validationErrors.map((v, i) => (
                  <li key={i}>
                    <code>{v.blockId ?? '?'}</code>: {v.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className={f.actions}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onRequestChanges(feedback)}
            disabled={isBusy || feedbackMissing}
          >
            {busy === 'revising' ? 'Revising… (can take 1–2 minutes)' : '✨ Request changes'}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            disabled={isBusy || pendingGraphCount > 0}
          >
            {busy === 'saving'
              ? 'Opening editor…'
              : pendingGraphCount > 0
                ? `Rendering ${pendingGraphCount} graph image${pendingGraphCount === 1 ? '' : 's'}…`
                : 'Continue to editor →'}
          </Button>
          <button type="button" onClick={handleDiscard} disabled={isBusy} style={S.discard}>
            Discard draft
          </button>
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  col: { display: 'flex', flexDirection: 'column', gap: 16 },
  headerCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '14px 16px',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--fg3)',
  },
  title: { margin: '6px 0 0', fontSize: 20, lineHeight: 1.3 },
  description: { margin: '6px 0 0', color: 'var(--fg2)', fontSize: 14, lineHeight: 1.5 },
  metaLine: { margin: '10px 0 0', color: 'var(--fg3)', fontSize: 13 },
  warnings: {
    padding: '10px 14px',
    background: 'var(--color-diff-med-bg)',
    color: 'var(--color-diff-med-fg)',
    border: '1px solid var(--color-diff-med-bd)',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    lineHeight: 1.5,
  },
  warningList: { margin: '6px 0 0', paddingLeft: 18 },
  blockList: { display: 'flex', flexDirection: 'column', gap: 12 },
  blockListBusy: { opacity: 0.45, pointerEvents: 'none' },
  blockCard: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
  },
  blockLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--fg3)',
    marginBottom: 8,
  },
  videoPlaceholder: {
    padding: '10px 12px',
    border: '1px dashed var(--border-strong)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--fg2)',
    fontSize: 14,
    fontStyle: 'italic',
  },
  footer: {
    position: 'sticky',
    bottom: 0,
    zIndex: 5,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 14,
    boxShadow: '0 -6px 16px rgba(0, 0, 0, 0.06)',
  },
  feedbackArea: { minHeight: 72, lineHeight: 1.5, resize: 'vertical' },
  discard: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    padding: '6px 8px',
    color: 'var(--color-danger)',
    fontSize: 13,
    cursor: 'pointer',
  },
  error: {
    padding: '10px 14px',
    background: 'var(--color-danger-bg, #fee2e2)',
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)',
    borderRadius: 'var(--radius-md)',
    fontSize: 13,
    lineHeight: 1.5,
  },
  errorList: { margin: '8px 0 0', paddingLeft: 18 },
};
