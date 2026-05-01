'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { toggleActive, deleteUser } from './actions';
import s from './forms.module.css';

export function StatusActions({ userId, isActive, isSelf }) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleActive, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteUser, null);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className={s.form}>
      {/* Deactivate / Reactivate — the routine action */}
      <form action={toggleAction} className={s.row}>
        <input type="hidden" name="user_id" value={userId} />
        <input
          type="hidden"
          name="next_state"
          value={isActive ? 'inactive' : 'active'}
        />
        <Button
          type="submit"
          disabled={togglePending}
          variant={isActive ? 'danger' : 'primary'}
          size="sm"
        >
          {togglePending
            ? '…'
            : isActive
              ? 'Deactivate'
              : 'Reactivate'}
        </Button>
        <span className={s.muted}>
          {isActive
            ? 'Hide from active rosters and block sign-in. Reversible.'
            : 'User is currently inactive. Reactivate to restore access.'}
        </span>
        {toggleState?.ok === false && (
          <span className={s.err}>{toggleState.error}</span>
        )}
      </form>

      {/* Delete — destructive, multi-step confirm */}
      <div>
        {!showDelete ? (
          <>
            <Button
              type="button"
              onClick={() => setShowDelete(true)}
              variant="remove"
              size="sm"
              disabled={isSelf}
              title={isSelf ? 'You cannot delete your own account' : undefined}
            >
              Delete account…
            </Button>
            {isSelf && (
              <span className={s.muted} style={{ marginLeft: 12 }}>
                You cannot delete your own admin account here.
              </span>
            )}
          </>
        ) : (
          <Card tone="danger">
            <form action={deleteAction} className={s.form}>
              <input type="hidden" name="user_id" value={userId} />
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>Permanently delete this account.</strong> The auth record
                and the profile row are both removed. This cannot be undone. For
                routine removal, use Deactivate instead.
              </p>
              <label className={s.label}>
                <span className={s.labelText}>
                  Type <code>DELETE</code> to confirm
                </span>
                <input
                  name="confirm"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className={s.input}
                  style={{ fontFamily: 'var(--font-mono)' }}
                  autoComplete="off"
                />
              </label>
              <div className={s.row}>
                <Button
                  type="submit"
                  variant="remove"
                  size="sm"
                  disabled={deletePending || confirmText !== 'DELETE'}
                >
                  {deletePending ? 'Deleting…' : 'Permanently delete'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowDelete(false); setConfirmText(''); }}
                >
                  Cancel
                </Button>
                {deleteState?.ok === false && (
                  <span className={s.err}>{deleteState.error}</span>
                )}
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
