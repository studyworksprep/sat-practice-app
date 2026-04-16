'use client';

import { useActionState } from 'react';
import { updateProfileFields } from './actions';

export function UserEditForm({ userId, initial }) {
  const [state, formAction, pending] = useActionState(updateProfileFields, null);

  return (
    <form action={formAction} style={S.form}>
      <input type="hidden" name="user_id" value={userId} />

      <div style={S.grid}>
        <Field label="First name" name="first_name" defaultValue={initial.first_name ?? ''} />
        <Field label="Last name" name="last_name" defaultValue={initial.last_name ?? ''} />
        <Field label="Email" name="email" type="email" defaultValue={initial.email ?? ''} />
        <Field label="Tutor name (display)" name="tutor_name" defaultValue={initial.tutor_name ?? ''} />
        <Field label="High school" name="high_school" defaultValue={initial.high_school ?? ''} />
        <Field label="Graduation year" name="graduation_year" type="number" defaultValue={initial.graduation_year ?? ''} />
        <Field label="Target SAT score" name="target_sat_score" type="number" defaultValue={initial.target_sat_score ?? ''} />
      </div>

      <div style={S.actions}>
        <button type="submit" disabled={pending} style={S.btn}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {state?.ok && !pending && <span style={S.ok}>Saved.</span>}
        {state?.ok === false && !pending && <span style={S.err}>{state.error}</span>}
      </div>
    </form>
  );
}

function Field({ label, name, defaultValue, type = 'text' }) {
  return (
    <label style={S.label}>
      <span style={S.labelText}>{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        style={S.input}
      />
    </label>
  );
}

const S = {
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '0.75rem',
  },
  label: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  labelText: { fontSize: '0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.025em' },
  input: { padding: '0.5rem 0.75rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem' },
  actions: { display: 'flex', gap: '0.75rem', alignItems: 'center' },
  btn: {
    padding: '0.5rem 1rem',
    background: '#2563eb',
    color: 'white',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
