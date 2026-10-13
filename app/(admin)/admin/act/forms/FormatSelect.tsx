// Inline format picker for one ACT form row. Saves on change through
// setActFormFormat and refreshes the page so the derived timing
// columns update.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ACT_FORMATS, ACT_FORMAT_LABELS, type ActFormat } from '@/lib/practice/act-test-plan';
import { setActFormFormat } from './actions';
import s from '../questions/ActQuestions.module.css';

export function FormatSelect({
  sourceTest,
  format,
  hasRow,
}: {
  sourceTest: string;
  format: ActFormat;
  /** False when the form has no act_forms row yet (runs as classic). */
  hasRow: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string) {
    setError(null);
    const fd = new FormData();
    fd.set('source_test', sourceTest);
    fd.set('format', next);
    startTransition(async () => {
      const res = await setActFormFormat(null, fd);
      if (res?.ok) router.refresh();
      else setError(res?.error ?? 'Save failed');
    });
  }

  return (
    <div>
      <select
        className={s.select}
        value={format}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-label={`Format for ${sourceTest}`}
      >
        {ACT_FORMATS.map((f) => (
          <option key={f} value={f}>{ACT_FORMAT_LABELS[f]}</option>
        ))}
      </select>
      {!hasRow && !pending && (
        <div className={s.fieldHint}>default — not saved yet</div>
      )}
      {error && <div className={s.error} role="alert">{error}</div>}
    </div>
  );
}
