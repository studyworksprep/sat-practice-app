'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { Card } from '@/lib/ui/Card';
import { toggleActive, banUser, unbanUser, deleteUser } from './actions';
import s from '../../../forms.module.css';

export function StatusActions({ userId, isActive, isBanned, isSelf }) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleActive, null);
  const [banState, banAction, banPending] = useActionState(banUser, null);
  const [unbanState, unbanAction, unbanPending] = useActionState(unbanUser, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteUser, null);
  const [showBan, setShowBan] = useState(false);
  const [banConfirm, setBanConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className={s.form}>
      {/* Deactivate / Reactivate — the routine action. Disabled
          while a ban is in effect; unban first to restore agency. */}
      <form action={toggleAction} className={s.row}>
        <input type="hidden" name="user_id" value={userId} />
        <input
          type="hidden"
          name="next_state"
          value={isActive ? 'inactive' : 'active'}
        />
        <Button
          type="submit"
          disabled={togglePending || isBanned}
          variant={isActive ? 'danger' : 'primary'}
          size="sm"
          title={isBanned ? 'Unban this user before changing active state' : undefined}
        >
          {togglePending
            ? '…'
            : isActive
              ? 'Deactivate'
              : 'Reactivate'}
        </Button>
        <span className={s.muted}>
          {isBanned
            ? 'User is banned. Unban first to manage active state.'
            : isActive
              ? 'Hide from active rosters and block sign-in. Reversible.'
              : 'User is currently inactive. Reactivate to restore access.'}
        </span>
        {toggleState?.ok === false && (
          <span className={s.err}>{toggleState.error}</span>
        )}
      </form>

      {/* Ban / Unban — for terms-of-service violations. Stronger
          signal than Deactivate; banned_at is a separate column so
          the audit trail of "this user was banned" survives any
          future is_active toggling. */}
      <div>
        {isBanned ? (
          <form action={unbanAction} className={s.row}>
            <input type="hidden" name="user_id" value={userId} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={unbanPending}
            >
              {unbanPending ? '…' : 'Unban user'}
            </Button>
            <span className={s.muted}>
              Clears the ban. is_active stays as-is — reactivate
              separately if you want them back on the roster.
            </span>
            {unbanState?.ok === false && (
              <span className={s.err}>{unbanState.error}</span>
            )}
          </form>
        ) : !showBan ? (
          <>
            <Button
              type="button"
              onClick={() => setShowBan(true)}
              variant="remove"
              size="sm"
              disabled={isSelf}
              title={isSelf ? 'You cannot ban your own account' : undefined}
            >
              Ban for ToS violation…
            </Button>
            {isSelf && (
              <span className={s.muted} style={{ marginLeft: 12 }}>
                You cannot ban your own admin account.
              </span>
            )}
          </>
        ) : (
          <Card tone="danger">
            <form action={banAction} className={s.form}>
              <input type="hidden" name="user_id" value={userId} />
              <p style={{ margin: 0, fontSize: 13 }}>
                <strong>Ban this user for a terms-of-service violation.</strong>
                {' '}Sets banned_at on the profile and forces the account
                inactive. The ban is reversible (Unban), but the timestamp
                stays in the column as an audit signal until cleared.
                For routine removal, use Deactivate instead.
              </p>
              <label className={s.label}>
                <span className={s.labelText}>
                  Type <code>BAN</code> to confirm
                </span>
                <input
                  name="confirm"
                  type="text"
                  value={banConfirm}
                  onChange={(e) => setBanConfirm(e.target.value)}
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
                  disabled={banPending || banConfirm !== 'BAN'}
                >
                  {banPending ? 'Banning…' : 'Ban user'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowBan(false); setBanConfirm(''); }}
                >
                  Cancel
                </Button>
                {banState?.ok === false && (
                  <span className={s.err}>{banState.error}</span>
                )}
              </div>
            </form>
          </Card>
        )}
      </div>

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
