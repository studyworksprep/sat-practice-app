// Inline student-facing name for one ACT form row. The placeholder is
// the default derived from the key (lib/practice/act-form-names.ts);
// typing something else saves an override on blur or Enter, and
// clearing the field goes back to the default.

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setActFormDisplayName } from './actions';
import s from '../questions/ActQuestions.module.css';

export function NameInput({
  sourceTest,
  displayName,
  defaultName,
}: {
  sourceTest: string;
  /** The saved override, or null when the form follows the default. */
  displayName: string | null;
  defaultName: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(displayName ?? '');
  const [saved, setSaved] = useState<string | null>(displayName ?? '');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    const next = value.trim();
    if (next === (saved ?? '')) return;
    setError(null);
    const fd = new FormData();
    fd.set('source_test', sourceTest);
    fd.set('display_name', next);
    startTransition(async () => {
      const res = await setActFormDisplayName(null, fd);
      if (res?.ok) {
        const stored = res.data?.custom ? res.data.name : '';
        setSaved(stored);
        setValue(stored);
        router.refresh();
      } else {
        setError(res?.error ?? 'Save failed');
      }
    });
  }

  return (
    <div>
      <input
        type="text"
        className={s.input}
        value={value}
        placeholder={defaultName}
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        disabled={pending}
        aria-label={`Student-facing name for ${sourceTest}`}
        style={{ minWidth: 220 }}
      />
      <div className={s.fieldHint}>
        {pending ? 'Saving…' : value.trim() ? 'custom name' : 'default from the key'}
      </div>
      {error && <div className={s.error} role="alert">{error}</div>}
    </div>
  );
}
