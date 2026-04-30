// Admin-only "Migrate to new tree" button on the student detail
// page. One click runs the v1 → v2 import, recomputes scores,
// and flips the user's app_metadata.ui_version to 'next'. After
// the next page load the proxy serves the new tree to that
// student. See docs/cutover-runbook.md for the surrounding
// pre-flight + verification steps.
//
// Confirms before firing — the action is idempotent and
// rollback is just setting the flag back to 'legacy', but the
// flip is visible to the student on their next nav so we make
// the operator pause briefly. Disabled when the student is
// already on 'next' (the page passes currentUiVersion in).

'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { migrateUserToNext } from './actions';

export function MigrateToNextButton({ studentId, currentUiVersion }) {
  const [state, formAction, pending] = useActionState(migrateUserToNext, null);
  const [confirming, setConfirming] = useState(false);

  const alreadyOnNext = currentUiVersion === 'next' || state?.ok === true;

  if (alreadyOnNext) {
    return (
      <p style={S.done}>
        Student is on the new tree
        {state?.ok && state.data?.flipped
          ? ` — imported ${state.data.importedAttempts ?? 0} test attempt${
              state.data.importedAttempts === 1 ? '' : 's'
            }, recomputed ${state.data.recomputed ?? 0}, brought ${state.data.errorNotesImported ?? 0} error note${
              state.data.errorNotesImported === 1 ? '' : 's'
            } across.`
          : '.'}
      </p>
    );
  }

  if (!confirming) {
    return (
      <div style={S.row}>
        <Button type="button" onClick={() => setConfirming(true)}>
          Migrate to new tree
        </Button>
        <span style={S.help}>
          Imports legacy practice history, recomputes scores, and flips
          the student to <code>ui_version=&apos;next&apos;</code>.
        </span>
      </div>
    );
  }

  return (
    <form action={formAction} style={S.form}>
      <input type="hidden" name="student_id" value={studentId} />
      <p style={S.warn}>
        On their next page load this student will switch to the new
        app. Rollback is reversible (admin sets{' '}
        <code>ui_version=&apos;legacy&apos;</code>) and no data is lost.
      </p>
      <div style={S.row}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Migrating…' : 'Confirm migrate'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        {state?.ok === false && !pending && (
          <span style={S.err}>{state.error}</span>
        )}
      </div>
    </form>
  );
}

const S = {
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' },
  help: { fontSize: '0.85rem', color: '#4b5563' },
  warn: { fontSize: '0.85rem', color: '#92400e', margin: 0 },
  done: { fontSize: '0.85rem', color: '#166534', margin: 0 },
  err:  { color: '#991b1b', fontSize: '0.85rem' },
};
