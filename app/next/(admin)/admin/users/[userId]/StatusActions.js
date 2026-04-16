'use client';

import { useActionState, useState } from 'react';
import { toggleActive, deleteUser } from './actions';

export function StatusActions({ userId, isActive, isSelf }) {
  const [toggleState, toggleAction, togglePending] = useActionState(toggleActive, null);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteUser, null);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  return (
    <div style={S.wrap}>
      {/* Deactivate / Reactivate — the routine action */}
      <form action={toggleAction} style={S.row}>
        <input type="hidden" name="user_id" value={userId} />
        <input
          type="hidden"
          name="next_state"
          value={isActive ? 'inactive' : 'active'}
        />
        <button
          type="submit"
          disabled={togglePending}
          style={isActive ? S.btnWarn : S.btnPrimary}
        >
          {togglePending
            ? '…'
            : isActive
              ? 'Deactivate'
              : 'Reactivate'}
        </button>
        <span style={S.help}>
          {isActive
            ? 'Hide from active rosters and block sign-in. Reversible.'
            : 'User is currently inactive. Reactivate to restore access.'}
        </span>
        {toggleState?.ok === false && (
          <span style={S.err}>{toggleState.error}</span>
        )}
      </form>

      {/* Delete — destructive, multi-step confirm */}
      <div style={{ ...S.row, alignItems: 'flex-start', flexDirection: 'column', gap: '0.5rem' }}>
        {!showDelete ? (
          <button
            type="button"
            onClick={() => setShowDelete(true)}
            style={S.btnDangerOutline}
            disabled={isSelf}
            title={isSelf ? 'You cannot delete your own account' : ''}
          >
            Delete account…
          </button>
        ) : (
          <form action={deleteAction} style={S.deleteForm}>
            <input type="hidden" name="user_id" value={userId} />
            <p style={S.deleteWarn}>
              <strong>Permanently delete this account.</strong> The auth record
              and the profile row are both removed. This cannot be undone. For
              routine removal, use Deactivate instead.
            </p>
            <label style={S.confirmLabel}>
              Type <code>DELETE</code> to confirm:
              <input
                name="confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                style={S.confirmInput}
                autoComplete="off"
              />
            </label>
            <div style={S.row}>
              <button
                type="submit"
                disabled={deletePending || confirmText !== 'DELETE'}
                style={S.btnDanger}
              >
                {deletePending ? 'Deleting…' : 'Permanently delete'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDelete(false); setConfirmText(''); }}
                style={S.cancel}
              >
                Cancel
              </button>
              {deleteState?.ok === false && (
                <span style={S.err}>{deleteState.error}</span>
              )}
            </div>
          </form>
        )}
        {isSelf && (
          <span style={S.help}>You cannot delete your own admin account here.</span>
        )}
      </div>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' },
  btnPrimary: { padding: '0.4rem 0.85rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  btnWarn: { padding: '0.4rem 0.85rem', background: '#b45309', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  btnDangerOutline: { padding: '0.4rem 0.85rem', background: 'white', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  btnDanger: { padding: '0.4rem 0.85rem', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' },
  cancel: { padding: '0.4rem 0.85rem', background: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer' },
  help: { fontSize: '0.8rem', color: '#6b7280' },
  deleteForm: { display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 },
  deleteWarn: { margin: 0, fontSize: '0.85rem', color: '#7f1d1d' },
  confirmLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#7f1d1d' },
  confirmInput: { padding: '0.35rem 0.6rem', border: '1px solid #fca5a5', borderRadius: 6, fontSize: '0.9rem', background: 'white', fontFamily: 'monospace' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
