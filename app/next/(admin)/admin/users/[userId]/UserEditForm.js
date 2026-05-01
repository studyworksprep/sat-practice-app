'use client';

import { useActionState } from 'react';
import { Button } from '@/lib/ui/Button';
import { updateProfileFields } from './actions';
import s from './forms.module.css';

export function UserEditForm({ userId, initial }) {
  const [state, formAction, pending] = useActionState(updateProfileFields, null);

  return (
    <form action={formAction} className={s.form}>
      <input type="hidden" name="user_id" value={userId} />

      <div className={s.grid}>
        <Field label="First name" name="first_name" defaultValue={initial.first_name ?? ''} />
        <Field label="Last name" name="last_name" defaultValue={initial.last_name ?? ''} />
        <Field label="Email" name="email" type="email" defaultValue={initial.email ?? ''} />
        <Field label="Tutor name (display)" name="tutor_name" defaultValue={initial.tutor_name ?? ''} />
        <Field label="High school" name="high_school" defaultValue={initial.high_school ?? ''} />
        <Field label="Graduation year" name="graduation_year" type="number" defaultValue={initial.graduation_year ?? ''} />
        <Field label="Target SAT score" name="target_sat_score" type="number" defaultValue={initial.target_sat_score ?? ''} />
      </div>

      <div className={s.actions}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        {state?.ok && !pending && <span className={s.ok}>Saved.</span>}
        {state?.ok === false && !pending && <span className={s.err}>{state.error}</span>}
      </div>
    </form>
  );
}

function Field({ label, name, defaultValue, type = 'text' }) {
  return (
    <label className={s.label}>
      <span className={s.labelText}>{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        className={s.input}
      />
    </label>
  );
}
