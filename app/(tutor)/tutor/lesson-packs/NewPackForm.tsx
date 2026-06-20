// Client island for the "create a new pack" form on the list page.
// Posts to createPack(), which redirects into the builder on
// success. useActionState surfaces the error message back inline
// when validation fails.

'use client';

import { useActionState } from 'react';
import { createPack } from './actions';
import s from './LessonPacksList.module.css';

export function NewPackForm() {
  const [state, formAction, pending] = useActionState(createPack, null);

  return (
    <form action={formAction} className={s.newForm}>
      <div className={s.newFormRow}>
        <label className={s.newFormLabel}>
          <span className={s.newFormLabelText}>Pack name</span>
          <input
            name="name"
            type="text"
            required
            maxLength={200}
            placeholder="e.g. Linear equations warm-up"
            className={s.newFormInput}
            disabled={pending}
          />
        </label>
      </div>
      <div className={s.newFormRow}>
        <label className={s.newFormLabel}>
          <span className={s.newFormLabelText}>Description (optional)</span>
          <textarea
            name="description"
            rows={2}
            maxLength={2000}
            placeholder="What this pack is for, prerequisites, etc."
            className={s.newFormTextarea}
            disabled={pending}
          />
        </label>
      </div>
      <div className={s.newFormFooter}>
        <button type="submit" className={s.newFormBtn} disabled={pending}>
          {pending ? 'Creating…' : '+ New pack'}
        </button>
        {state && !state.ok && (
          <span className={s.newFormError}>{state.error}</span>
        )}
      </div>
    </form>
  );
}
