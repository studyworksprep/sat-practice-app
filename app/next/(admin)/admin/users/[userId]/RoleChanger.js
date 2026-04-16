'use client';

import { useActionState, useState } from 'react';
import { changeRole } from './actions';

const ROLES = [
  { value: 'practice', label: 'Practice' },
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Admin' },
];

export function RoleChanger({ userId, currentRole }) {
  const [selected, setSelected] = useState(currentRole);
  const [state, formAction, pending] = useActionState(changeRole, null);

  const dirty = selected !== currentRole;
  const isPromotion = dirty && selected === 'admin' && currentRole !== 'admin';

  return (
    <form action={formAction} style={S.form}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="role" value={selected} />
      {isPromotion && <input type="hidden" name="confirm_admin" value="yes" />}

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={S.select}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>

      {dirty && (
        <>
          {isPromotion && (
            <span style={S.warn}>
              Promoting to Admin grants full platform access. Click Save to confirm.
            </span>
          )}
          <button type="submit" disabled={pending} style={isPromotion ? S.btnDanger : S.btn}>
            {pending ? 'Saving…' : isPromotion ? 'Confirm promotion' : 'Save role'}
          </button>
          <button
            type="button"
            onClick={() => setSelected(currentRole)}
            style={S.cancel}
          >
            Cancel
          </button>
        </>
      )}

      {state?.ok && !pending && !dirty && <span style={S.ok}>Role updated.</span>}
      {state?.ok === false && !pending && <span style={S.err}>{state.error}</span>}
    </form>
  );
}

const S = {
  form: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' },
  select: { padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.9rem', background: 'white' },
  btn: { padding: '0.4rem 0.85rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { padding: '0.4rem 0.85rem', background: '#b45309', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  cancel: { padding: '0.4rem 0.85rem', background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer' },
  warn: { fontSize: '0.8rem', color: '#92400e', flexBasis: '100%' },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
