'use client';

import { useRef } from 'react';
import { DesmosPanel } from './DesmosPanel';
import s from './LessonCalculatorPane.module.css';

type DesmosExpression = { id?: string; latex: string } & Record<string, unknown>;

type Presentation = {
  display: 'hidden' | 'available' | 'open';
  mode: 'scratch' | 'preset' | 'interactive';
  title: string;
  initial_state: Record<string, unknown> | null;
  initial_expressions: DesmosExpression[];
  calculator_options: {
    expressions?: boolean;
    lockViewport?: boolean;
    sliders?: boolean;
    keypadActivated?: boolean;
  };
  resettable: boolean;
  required: boolean;
  seed_version?: string | null;
};

type Calculator = {
  setBlank?: (options?: { allowUndo?: boolean }) => void;
  setState?: (state: Record<string, unknown>, options?: { allowUndo?: boolean }) => void;
  setExpressions?: (expressions: DesmosExpression[]) => void;
  setDefaultState?: (state: Record<string, unknown>) => void;
  getState?: () => Record<string, unknown>;
  clearHistory?: () => void;
  resize?: () => void;
  focusFirstExpression?: () => void;
};

export function LessonCalculatorPane({
  open,
  presentation,
  storageKey,
  onClose,
  onCalcReady,
}: {
  open: boolean;
  presentation: Presentation;
  storageKey: string;
  onClose: () => void;
  onCalcReady: (calculator: Calculator | null) => void;
}) {
  const calculatorRef = useRef<Calculator | null>(null);

  function handleReady(calculator: Calculator | null) {
    calculatorRef.current = calculator;
    onCalcReady(calculator);
  }

  function resetCalculator() {
    const calculator = calculatorRef.current;
    if (!calculator) return;
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey);
      if (presentation.initial_state) {
        calculator.setState?.(presentation.initial_state, { allowUndo: false });
      } else {
        calculator.setBlank?.({ allowUndo: false });
        if (presentation.initial_expressions.length > 0) {
          calculator.setExpressions?.(presentation.initial_expressions);
        }
      }
      const state = calculator.getState?.();
      if (state) calculator.setDefaultState?.(state);
      calculator.clearHistory?.();
      calculator.resize?.();
      if (presentation.calculator_options.keypadActivated) {
        requestAnimationFrame(() => calculator.focusFirstExpression?.());
      }
    } catch {}
  }

  return (
    <aside className={`${s.pane} ${open ? s.paneOpen : s.paneClosed}`} aria-hidden={!open}>
      <div className={s.header}>
        <div className={s.headingGroup}>
          <span className={`${s.badge} ${presentation.required ? s.badgeRequired : ''}`}>
            {presentation.required ? 'Required activity' : presentation.mode === 'preset' ? 'Preset graph' : 'Calculator'}
          </span>
          <strong className={s.title}>{presentation.title}</strong>
        </div>
        <div className={s.actions}>
          {presentation.resettable ? (
            <button type="button" className={s.actionButton} onClick={resetCalculator}>
              Reset
            </button>
          ) : null}
          <button type="button" className={s.actionButton} onClick={onClose} aria-label="Hide calculator">
            Hide
          </button>
        </div>
      </div>
      <div className={s.body}>
        <DesmosPanel
          isOpen={open}
          fitToContainer
          storageKey={storageKey}
          initialState={presentation.initial_state}
          initialExpressions={presentation.initial_expressions}
          calculatorOptions={presentation.calculator_options}
          onCalcReady={handleReady}
        />
      </div>
    </aside>
  );
}
