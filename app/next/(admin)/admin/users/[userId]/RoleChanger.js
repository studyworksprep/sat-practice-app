'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
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
          <Button
            type="submit"
            disabled={pending}
            variant={isPromotion ? 'danger' : 'primary'}
            size="sm"
          >
            {pending ? 'Saving…' : isPromotion ? 'Confirm promotion' : 'Save role'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setSelected(currentRole)}
          >
            Cancel
          </Button>
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
  warn: { fontSize: '0.8rem', color: '#92400e', flexBasis: '100%' },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
