'use client';

// Pinned-figure editor (plan 3.1). Any block's content may carry a
// `figure` {src, alt, caption} that the slideshow keeps visible in the
// side pane while the block is on screen. This panel edits that
// object; leaving the image URL empty removes it.

import { Button } from '@/lib/ui/Button';
import { TextField } from './editor-fields';
import f from '../../../forms.module.css';

type Figure = {
  src?: string;
  alt?: string;
  caption?: string;
};

export function FigureEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const raw = content.figure;
  const figure: Figure = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Figure
    : {};
  const hasFigure = typeof figure.src === 'string' && figure.src.trim() !== '';

  function patch(next: Partial<Figure>) {
    const merged: Figure = { ...figure, ...next };
    if (merged.caption != null && merged.caption.trim() === '') delete merged.caption;
    onChange({ ...content, figure: merged });
  }

  function removeFigure() {
    const nextContent = { ...content };
    delete nextContent.figure;
    onChange(nextContent);
  }

  return (
    <details style={S.wrap}>
      <summary style={S.summary}>
        Pinned figure{hasFigure ? ' ✓' : ''}
      </summary>
      <div style={S.body}>
        <p className={f.formHint} style={{ margin: 0 }}>
          Stays visible in the side pane while this block is on screen.
          Attach the same figure to every block that refers to it.
        </p>
        <TextField
          label="Image URL"
          value={figure.src ?? ''}
          onChange={(value: string) => patch({ src: value })}
          placeholder="/images/lessons/similar-triangles.svg"
          required={false}
          hint="Path under public/ or a full URL."
        />
        <TextField
          label="Alt text"
          value={figure.alt ?? ''}
          onChange={(value: string) => patch({ alt: value })}
          placeholder="Two similar triangles sharing an angle"
          required={false}
          hint="Required — what a screen reader announces instead of the image."
        />
        <TextField
          label="Caption"
          value={figure.caption ?? ''}
          onChange={(value: string) => patch({ caption: value })}
          placeholder=""
          required={false}
          hint="Optional, shown under the image."
        />
        {hasFigure ? (
          <>
            <div style={S.previewHost}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={figure.src} alt={figure.alt ?? ''} style={S.previewImg} />
            </div>
            <div>
              <Button type="button" variant="remove" size="sm" onClick={removeFigure}>
                Remove figure
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </details>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    borderTop: '1px solid var(--border)',
    paddingTop: 10,
    marginTop: 4,
  },
  summary: {
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--color-navy-900)',
  },
  body: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  previewHost: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--card)',
    padding: 8,
  },
  previewImg: {
    display: 'block',
    width: '100%',
    maxHeight: 260,
    objectFit: 'contain',
  },
};
