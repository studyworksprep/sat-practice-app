'use client';

// Per-block error isolation for the AI draft preview.
//
// DraftPreview renders model-generated content through the editor's
// BlockPreview renderers. Without a boundary, a render throw in any
// single block bubbles to the (admin) segment error boundary, which
// replaces the whole page with the generic error screen — discarding
// the admin's draft (often several minutes of generation) along with
// the other N-1 perfectly renderable blocks. One bad block must
// degrade to a card-level notice, not a page-level failure.
//
// The capture is tagged with the block type and index so the Sentry
// event pinpoints which renderer/content shape broke, instead of the
// anonymous full-page capture the segment boundary produces.

import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

interface DraftBlockBoundaryProps {
  blockType: string;
  blockIndex: number;
  children: ReactNode;
}

interface DraftBlockBoundaryState {
  failed: boolean;
}

export class DraftBlockBoundary extends Component<
  DraftBlockBoundaryProps,
  DraftBlockBoundaryState
> {
  state: DraftBlockBoundaryState = { failed: false };

  static getDerivedStateFromError(): DraftBlockBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    Sentry.captureException(error, {
      tags: {
        layer: 'lesson_gen_block_preview',
        block_type: this.props.blockType,
      },
      extra: { block_index: this.props.blockIndex },
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={FALLBACK}>
        This block couldn&rsquo;t be previewed. It is still part of the draft —
        if you continue to the editor you can inspect and fix it there. The
        error has been reported.
      </div>
    );
  }
}

const FALLBACK: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px dashed var(--color-danger)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-danger)',
  fontSize: 13,
  fontStyle: 'italic',
};
