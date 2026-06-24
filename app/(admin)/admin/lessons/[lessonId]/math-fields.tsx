// Math-aware text inputs for lesson block forms.
//
// Drop-in replacements for the plain TextField / TextAreaField in
// editor-fields.js, plus a √x / √x⏎ control that opens the MathLive
// popover and splices \( … \) / \[ … \] into the field at the cursor.
// The stored value stays a plain string with TeX delimiters, which
// MathText (plain-text fields) or HtmlBlock (HTML fields) typeset on
// render.

'use client';

import { useRef, useState } from 'react';
import { MathField } from '../../questions/new/MathField';
import f from '../../../forms.module.css';

type Props = {
  label: string;
  value: string | undefined;
  onChange: (next: string) => void;
  rows?: number;
  hint?: string;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
};

function useMathInsert(
  value: string | undefined,
  onChange: (next: string) => void,
  ref: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
) {
  const [popover, setPopover] = useState<{ display: boolean } | null>(null);
  const draft = useRef('');
  const sel = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  function open(display: boolean) {
    const el = ref.current;
    const len = (value ?? '').length;
    sel.current = el
      ? { start: el.selectionStart ?? len, end: el.selectionEnd ?? len }
      : { start: len, end: len };
    draft.current = '';
    setPopover({ display });
  }

  function confirm() {
    const latex = draft.current.trim();
    if (!latex) {
      setPopover(null);
      return;
    }
    const snippet = popover?.display ? `\\[${latex}\\]` : `\\(${latex}\\)`;
    const v = value ?? '';
    const { start, end } = sel.current;
    onChange(v.slice(0, start) + snippet + v.slice(end));
    setPopover(null);
  }

  return { popover, setPopover, draft, open, confirm };
}

function MathControls({
  open,
}: {
  open: (display: boolean) => void;
}) {
  return (
    <div style={S.controls}>
      <button type="button" style={S.miniBtn} title="Insert inline equation" onClick={() => open(false)}>
        √x
      </button>
      <button type="button" style={S.miniBtn} title="Insert display equation" onClick={() => open(true)}>
        √x⏎
      </button>
    </div>
  );
}

function MathPopover({
  display,
  draftRef,
  onConfirm,
  onCancel,
}: {
  display: boolean;
  draftRef: React.MutableRefObject<string>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={S.popover}>
      <span style={S.popoverLabel}>Insert {display ? 'display' : 'inline'} equation</span>
      <MathField
        value=""
        onChange={(v: string) => {
          draftRef.current = v;
        }}
        onEnter={onConfirm}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...S.miniBtn, ...S.primary }} onClick={onConfirm}>
          Insert
        </button>
        <button type="button" style={S.miniBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function MathTextArea({ label, value, onChange, rows = 3, hint, placeholder, mono, required }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const ins = useMathInsert(value, onChange, ref);
  return (
    <label className={f.label}>
      <span style={S.labelRow}>
        <span className={f.labelText}>{label}{required ? ' *' : ''}</span>
        <MathControls open={ins.open} />
      </span>
      <textarea
        ref={ref}
        className={f.input}
        value={value ?? ''}
        rows={rows}
        placeholder={placeholder}
        spellCheck={!mono}
        onChange={(e) => onChange(e.target.value)}
        style={mono ? { fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } : undefined}
      />
      {ins.popover ? (
        <MathPopover display={ins.popover.display} draftRef={ins.draft} onConfirm={ins.confirm} onCancel={() => ins.setPopover(null)} />
      ) : null}
      {hint ? <span className={f.muted} style={{ fontSize: 11 }}>{hint}</span> : null}
    </label>
  );
}

export function MathTextField({ label, value, onChange, hint, placeholder, required }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const ins = useMathInsert(value, onChange, ref);
  return (
    <label className={f.label}>
      <span style={S.labelRow}>
        <span className={f.labelText}>{label}{required ? ' *' : ''}</span>
        <MathControls open={ins.open} />
      </span>
      <input
        ref={ref}
        type="text"
        className={f.input}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {ins.popover ? (
        <MathPopover display={ins.popover.display} draftRef={ins.draft} onConfirm={ins.confirm} onCancel={() => ins.setPopover(null)} />
      ) : null}
      {hint ? <span className={f.muted} style={{ fontSize: 11 }}>{hint}</span> : null}
    </label>
  );
}

const S: Record<string, React.CSSProperties> = {
  labelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  controls: { display: 'flex', gap: 4 },
  miniBtn: {
    minWidth: 26,
    height: 22,
    padding: '0 6px',
    border: '1px solid var(--border)',
    borderRadius: 5,
    background: 'var(--bg-white, var(--card))',
    color: 'var(--fg1)',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'inherit',
    lineHeight: 1,
  },
  primary: {
    background: 'var(--color-app-accent, #4f7ce0)',
    borderColor: 'var(--color-app-accent, #4f7ce0)',
    color: '#fff',
  },
  popover: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 10,
    marginTop: 6,
    border: '1px solid var(--color-app-accent)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-app-accent-bg, #eef)',
  },
  popoverLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--color-navy-900)',
  },
};
