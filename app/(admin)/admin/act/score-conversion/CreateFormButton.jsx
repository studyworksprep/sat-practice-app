// Small client island for the "+ New form" affordance on the
// score-conversion page. Pops a `prompt()` for the source_test
// string and POSTs through the createConversionForm action — the
// page refreshes via revalidatePath so the new form shows up in
// the picker without a full reload.

'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createConversionForm } from './actions';
import s from './ScoreConversion.module.css';

export function CreateFormButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    const name = window.prompt('Source-test name (e.g. "ACT-25MC1"):');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const fd = new FormData();
    fd.set('source_test', trimmed);
    startTransition(async () => {
      const res = await createConversionForm(null, fd);
      if (res && !res.ok) {
        window.alert(res.error ?? 'Could not create form');
        return;
      }
      router.push(`/admin/act/score-conversion?form=${encodeURIComponent(trimmed)}&section=english`);
    });
  }

  return (
    <button
      type="button"
      className={s.newFormBtn}
      onClick={onClick}
      disabled={pending}
    >
      {pending ? 'Adding…' : '+ New form'}
    </button>
  );
}
