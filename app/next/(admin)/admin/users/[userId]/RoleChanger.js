'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { changeRole } from './actions';
import s from '../../../forms.module.css';

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
    <form action={formAction} className={s.row}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="role" value={selected} />
      {isPromotion && <input type="hidden" name="confirm_admin" value="yes" />}

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className={s.select}
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>

      {dirty && (
        <>
          {isPromotion && (
            <span className={s.warnInline}>
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

      {state?.ok && !pending && !dirty && <span className={s.ok}>Role updated.</span>}
      {state?.ok === false && !pending && <span className={s.err}>{state.error}</span>}
    </form>
  );
}
