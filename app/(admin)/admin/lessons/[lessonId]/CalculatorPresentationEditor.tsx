'use client';

import { useRef, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { DesmosPanel } from '@/lib/ui/DesmosPanel';
import { DESMOS_API_KEY } from '@/lib/config/desmos';
import { CheckboxField, SelectField, TextField } from './editor-fields';
import f from '../../../forms.module.css';

type Calculator = {
  getState?: () => Record<string, unknown>;
};

type Presentation = {
  display?: 'hidden' | 'available' | 'open';
  mode?: 'scratch' | 'preset';
  title?: string;
  initial_state?: Record<string, unknown>;
  editable?: boolean;
  resettable?: boolean;
  lock_viewport?: boolean;
};

export function CalculatorPresentationEditor({
  blockId,
  content,
  onChange,
}: {
  blockId: string;
  content: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const calculatorRef = useRef<Calculator | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const raw = content.calculator;
  const calculator: Presentation = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Presentation
    : {};
  const display = calculator.display ?? 'available';
  const mode = calculator.mode ?? 'scratch';

  function patch(next: Partial<Presentation>) {
    onChange({
      ...content,
      calculator: {
        ...calculator,
        ...next,
      },
    });
  }

  function captureStartingGraph() {
    const state = calculatorRef.current?.getState?.();
    if (!state) {
      setNote('The calculator is still loading. Try again in a moment.');
      return;
    }
    patch({ initial_state: state, mode: 'preset' });
    setNote('Captured the complete starting graph, including viewport and styles.');
  }

  function clearStartingGraph() {
    const nextCalculator = { ...calculator };
    delete nextCalculator.initial_state;
    onChange({ ...content, calculator: nextCalculator });
    setNote('Removed the captured starting graph.');
  }

  return (
    <details style={S.wrap}>
      <summary style={S.summary}>Calculator presentation</summary>
      <div style={S.body}>
        <p className={f.formHint} style={{ margin: 0 }}>
          Desmos is available by default. Choose a preset to open this block with an author-created graph.
        </p>
        <SelectField
          label="Visibility"
          value={display}
          onChange={(value: string) => patch({ display: value as Presentation['display'] })}
          options={['hidden', 'available', 'open']}
        />
        <SelectField
          label="Mode"
          value={mode}
          onChange={(value: string) => patch({ mode: value as Presentation['mode'] })}
          options={['scratch', 'preset']}
        />
        <TextField
          label="Pane title"
          value={calculator.title ?? ''}
          onChange={(value: string) => patch({ title: value })}
          placeholder=""
          required={false}
          hint="Optional. Defaults to Scratch calculator or Explore the graph."
        />

        {mode === 'preset' ? (
          <>
            <div style={S.options}>
              <CheckboxField
                label="Allow expression editing"
                checked={calculator.editable !== false}
                onChange={(checked: boolean) => patch({ editable: checked })}
              />
              <CheckboxField
                label="Show Reset"
                checked={calculator.resettable !== false}
                onChange={(checked: boolean) => patch({ resettable: checked })}
              />
              <CheckboxField
                label="Lock viewport"
                checked={calculator.lock_viewport === true}
                onChange={(checked: boolean) => patch({ lock_viewport: checked })}
              />
            </div>
            <div style={S.graphHost}>
              {DESMOS_API_KEY ? (
                <DesmosPanel
                  isOpen
                  storageKey={`lesson-preset-author:${blockId}`}
                  initialState={calculator.initial_state ?? null}
                  fitToContainer
                  onCalcReady={(calc: Calculator | null) => { calculatorRef.current = calc; }}
                />
              ) : (
                <div style={S.noKey}>
                  Set <strong>NEXT_PUBLIC_DESMOS_API_KEY</strong> to author preset graphs.
                </div>
              )}
            </div>
            <div style={S.actions}>
              <Button type="button" variant="primary" size="sm" onClick={captureStartingGraph} disabled={!DESMOS_API_KEY}>
                Capture starting graph
              </Button>
              {calculator.initial_state ? (
                <Button type="button" variant="remove" size="sm" onClick={clearStartingGraph}>
                  Remove captured graph
                </Button>
              ) : null}
            </div>
            {note ? <span className={f.muted} style={{ fontSize: 12 }}>{note}</span> : null}
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
  options: { display: 'grid', gap: 8 },
  graphHost: {
    height: 430,
    overflow: 'hidden',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--card)',
  },
  noKey: { padding: 16, color: 'var(--color-danger)', fontSize: 13 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
};
