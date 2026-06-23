// Desmos block editor — "author by demonstration".
//
// The painful part of authoring a desmos_interactive block is writing
// the target `validation.expected` expressions (and the matching
// min/max expression counts) by hand. This editor removes that: it
// embeds a live Desmos calculator (the same DesmosPanel the practice
// flows use), lets the admin build the target graph directly, then
// "Capture target state" reads the calculator's visible expressions
// and writes them into validation.expected + state_rules — exactly
// the fields the runtime grader (validateDesmosSubmission) checks.
//
// The full structured form (goal, feedback, hints, progression,
// workflow) stays below via the existing DesmosBlockEditor; capture
// just pre-fills the tedious bits. onChange always emits cleaned
// content so empty arrays/keys don't accumulate.

'use client';

import { useRef, useState } from 'react';
import { DesmosPanel } from '@/lib/ui/DesmosPanel';
import { DESMOS_API_KEY } from '@/lib/config/desmos';
import { Button } from '@/lib/ui/Button';
import { cleanupDesmosContent } from '@/lib/lesson/desmos-form-utils.mjs';
import { DesmosBlockEditor } from './DesmosBlockEditor';
import f from '../../../forms.module.css';

type DesmosExpr = { id?: string; latex?: string; hidden?: boolean };
type DesmosCalc = {
  getExpressions?: () => DesmosExpr[];
  setExpression?: (e: { id: string; latex: string }) => void;
  getState?: () => unknown;
};

type Validation = {
  mode?: string;
  expected?: string[];
  test_values?: number[];
  tolerance?: number;
  state_rules?: Record<string, unknown>;
};
type Content = { id?: string; validation?: Validation } & Record<string, unknown>;

export function DesmosEditor({
  content,
  onChange,
}: {
  content: Content;
  onChange: (next: Content) => void;
}) {
  const calcRef = useRef<DesmosCalc | null>(null);
  const [captured, setCaptured] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const blockId = (typeof content?.id === 'string' && content.id) || 'desmos';
  const mode = content?.validation?.mode ?? 'equivalent';

  function emit(next: Content) {
    onChange(cleanupDesmosContent({ ...next, type: 'desmos_interactive' }) as Content);
  }

  function visibleLatexes(calc: DesmosCalc): string[] {
    const list = calc.getExpressions?.() ?? [];
    return list
      .filter((e) => e && typeof e.latex === 'string' && e.latex.trim() && !e.hidden)
      .map((e) => (e.latex as string).trim());
  }

  function onCalcReady(calc: DesmosCalc | null) {
    calcRef.current = calc;
    if (!calc) return;
    // Seed the calculator from the current target so capture is
    // iterative — but only if the admin's graph is blank (DesmosPanel
    // may have restored an in-progress graph from localStorage).
    try {
      const existing = visibleLatexes(calc);
      const expected = Array.isArray(content?.validation?.expected)
        ? (content.validation!.expected as string[])
        : [];
      if (existing.length === 0 && expected.length > 0) {
        expected.forEach((latex, i) => calc.setExpression?.({ id: `seed_${i}`, latex }));
      }
    } catch {
      /* seeding is best-effort */
    }
  }

  function captureNow() {
    const calc = calcRef.current;
    if (!calc) {
      setNote('The calculator is still loading — give it a moment and try again.');
      return;
    }
    const visible = visibleLatexes(calc);
    if (visible.length === 0) {
      setCaptured([]);
      setNote('The graph is empty — enter at least one expression, then capture.');
      return;
    }

    const validation: Validation = { ...(content.validation ?? {}) };
    validation.expected = visible;
    validation.state_rules = {
      ...(validation.state_rules ?? {}),
      min_expressions: visible.length,
      max_expressions: visible.length,
      require_visible_only: true,
    };
    // equivalent / compare_expressions grading needs test_values; seed
    // sane defaults if the author hasn't set any yet.
    if (
      (validation.mode === 'equivalent' || validation.mode === 'compare_expressions') &&
      (!Array.isArray(validation.test_values) || validation.test_values.length === 0)
    ) {
      validation.test_values = [-2, 0, 2, 4];
      validation.tolerance = validation.tolerance ?? 0.000001;
    }

    emit({ ...content, validation });
    setCaptured(visible);
    setNote(
      `Captured ${visible.length} expression${visible.length === 1 ? '' : 's'} as the target` +
        (mode === 'state' ? ' (state-rule counts updated).' : '.'),
    );
  }

  return (
    <div style={S.wrap}>
      <section style={S.capture}>
        <div className={f.subhead} style={{ margin: 0 }}>
          Author by demonstration
        </div>
        <p className={f.formHint}>
          Build the target graph in the calculator below, then capture it. Capture
          fills <code>validation.expected</code> and the min/max expression counts the
          learner is checked against. Current check mode: <code>{mode}</code>.
        </p>

        <div style={S.calcHost}>
          {DESMOS_API_KEY ? (
            <DesmosPanel isOpen storageKey={`lesson-desmos-author:${blockId}`} onCalcReady={onCalcReady} />
          ) : (
            <div style={S.noKey}>
              <strong>Desmos can’t load.</strong> The <code>NEXT_PUBLIC_DESMOS_API_KEY</code>{' '}
              environment variable is not set, so the calculator script initialises without a key
              and refuses to render — in both this editor and the student preview. Set the key in
              your environment (see <code>.env.example</code>) and reload.
            </div>
          )}
        </div>

        <div style={S.captureRow}>
          <Button type="button" variant="primary" size="sm" onClick={captureNow} disabled={!DESMOS_API_KEY}>
            Capture target state from graph
          </Button>
          {note ? <span className={f.muted} style={{ fontSize: 12 }}>{note}</span> : null}
        </div>

        {captured && captured.length > 0 ? (
          <ul style={S.capturedList}>
            {captured.map((latex, i) => (
              <li key={i} style={S.capturedItem}>
                <code>{latex}</code>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <DesmosBlockEditor content={content} onChange={emit} />
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  capture: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    border: '1px solid var(--color-app-accent)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-app-accent-bg, #eef)',
  },
  calcHost: {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    overflow: 'hidden',
    background: 'var(--bg-white, var(--card))',
  },
  noKey: {
    padding: 16,
    fontSize: 13,
    lineHeight: 1.5,
    color: 'var(--color-danger)',
    background: 'var(--color-danger-bg, #fee2e2)',
  },
  captureRow: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  capturedList: {
    listStyle: 'none',
    margin: 0,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--card)',
  },
  capturedItem: { fontSize: 13 },
};
