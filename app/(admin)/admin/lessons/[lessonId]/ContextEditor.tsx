'use client';

// Pinned-context editor — the text twin of FigureEditor. Any block's
// content may carry a `context` {html, label} that the slideshow keeps
// visible beside the block (side pane on desktop, inline above it on
// narrow screens), so a check can refer to a passage, sentence, or
// table that was introduced on an earlier slide. Leaving the HTML
// empty removes it.

import { Button } from '@/lib/ui/Button';
import { SafeHtml } from '@/lib/ui/SafeHtml';
import { TextField, TextAreaField } from './editor-fields';
import f from '../../../forms.module.css';

type Context = {
  html?: string;
  label?: string;
};

export function ContextEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const raw = content.context;
  const context: Context = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Context
    : {};
  const hasContext = typeof context.html === 'string' && context.html.trim() !== '';

  function patch(next: Partial<Context>) {
    const merged: Context = { ...context, ...next };
    if (merged.label != null && merged.label.trim() === '') delete merged.label;
    onChange({ ...content, context: merged });
  }

  function removeContext() {
    const nextContent = { ...content };
    delete nextContent.context;
    onChange(nextContent);
  }

  return (
    <details style={S.wrap}>
      <summary style={S.summary}>
        Pinned context{hasContext ? ' ✓' : ''}
      </summary>
      <div style={S.body}>
        <p className={f.formHint} style={{ margin: 0 }}>
          A passage, sentence, or table that stays visible beside this block.
          Use it whenever the prompt refers to text the learner saw on an
          earlier slide.
        </p>
        <TextField
          label="Label"
          value={context.label ?? ''}
          onChange={(value: string) => patch({ label: value })}
          placeholder="Passage"
          required={false}
          hint="Optional short heading: Passage, Sentence, Table."
        />
        <TextAreaField
          label="HTML"
          value={context.html ?? ''}
          onChange={(value: string) => patch({ html: value })}
          placeholder="<blockquote><p>Museums sometimes display replicas…</p></blockquote>"
          rows={6}
          mono
          hint="Same HTML as a text block — paste the blockquote or table from the slide that introduced it."
        />
        {hasContext ? (
          <>
            <div style={S.previewHost}>
              <SafeHtml as="div" html={context.html ?? ''} className="prose lesson-prose" />
            </div>
            <div>
              <Button type="button" variant="remove" size="sm" onClick={removeContext}>
                Remove context
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
    maxHeight: 260,
    overflow: 'auto',
  },
};
