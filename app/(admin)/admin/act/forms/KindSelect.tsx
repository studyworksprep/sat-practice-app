// Inline kind picker for one ACT form row (released exam / online
// practice test). Saves on change through setActFormKind and refreshes
// the page so the completeness pills update.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ACT_FORM_KINDS, ACT_FORM_KIND_LABELS, type ActFormKind } from '@/lib/practice/act-test-plan';
import { setActFormKind } from './actions';
import s from '../questions/ActQuestions.module.css';

export function KindSelect({
  sourceTest,
  kind,
  hasRow,
}: {
  sourceTest: string;
  kind: ActFormKind;
  /** False when the form has no act_forms row yet (defaults apply). */
  hasRow: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onChange(next: string) {
    setError(null);
    const fd = new FormData();
    fd.set('source_test', sourceTest);
    fd.set('kind', next);
    startTransition(async () => {
      const res = await setActFormKind(null, fd);
      if (res?.ok) router.refresh();
      else setError(res?.error ?? 'Save failed');
    });
  }

  return (
    <div>
      <select
        className={s.select}
        value={kind}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        aria-label={`Kind of form for ${sourceTest}`}
      >
        {ACT_FORM_KINDS.map((k) => (
          <option key={k} value={k}>{ACT_FORM_KIND_LABELS[k]}</option>
        ))}
      </select>
      {!hasRow && !pending && (
        <div className={s.fieldHint}>default — not saved yet</div>
      )}
      {error && <div className={s.error} role="alert">{error}</div>}
    </div>
  );
}
