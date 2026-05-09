// "Migrate remaining legacy students" button on the /admin landing
// page. Bulk version of MigrateToNextButton — one click chips
// through up to 50 legacy students at a time. See
// app/next/(admin)/admin/actions.js for the server side.
//
// Two-click confirmation matches the per-student button. The
// summary shows succeeded / failed counts plus a per-failure list,
// and a "X remaining" badge so the operator knows whether to
// click again.

'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/lib/ui/Button';
import { bulkMigrateLegacyStudents } from './actions';

export function BulkMigrateButton({ initialRemaining }) {
  const [state, formAction, pending] = useActionState(bulkMigrateLegacyStudents, null);
  const [confirming, setConfirming] = useState(false);

  // After the first run, prefer the action's freshly-computed
  // remaining count over the page-render snapshot.
  const remaining = state?.ok && typeof state.data?.remaining === 'number'
    ? state.data.remaining
    : initialRemaining;

  if (remaining === 0 && !state) {
    return (
      <p style={S.done}>
        No legacy students remain — every <code>role=&apos;student&apos;</code>{' '}
        profile is on <code>ui_version=&apos;next&apos;</code>.
      </p>
    );
  }

  if (!confirming) {
    return (
      <div style={S.wrap}>
        <div style={S.row}>
          <Button type="button" onClick={() => setConfirming(true)} disabled={pending}>
            Migrate next 50 legacy students
          </Button>
          <span style={S.help}>
            <strong>{remaining}</strong> student
            {remaining === 1 ? '' : 's'} still on <code>ui_version=&apos;legacy&apos;</code>.
          </span>
        </div>
        {state && <RunSummary state={state} />}
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <form action={formAction} style={S.form}>
        <p style={S.warn}>
          This will import legacy practice history, recompute scores,
          and flip up to 50 students to the new tree on their next
          page load. Idempotent + per-student reversible (set{' '}
          <code>ui_version=&apos;legacy&apos;</code> on a profile to roll
          back), but bulk-undo is not provided.
        </p>
        <div style={S.row}>
          <Button type="submit" disabled={pending}>
            {pending ? 'Migrating…' : `Confirm — migrate next 50`}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirming(false)}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </form>
      {state && <RunSummary state={state} />}
    </div>
  );
}

function RunSummary({ state }) {
  if (!state.ok) {
    return <p style={S.err}>{state.error}</p>;
  }
  const { processed, succeeded, failed, remaining, results } = state.data ?? {};
  if (processed === 0) {
    return <p style={S.muted}>No legacy students were eligible for this batch.</p>;
  }
  const failures = (results ?? []).filter((r) => !r.ok);
  return (
    <div style={S.summary}>
      <p style={S.summaryLine}>
        Processed <strong>{processed}</strong> · succeeded{' '}
        <strong style={S.okText}>{succeeded}</strong>
        {failed > 0 && <> · failed <strong style={S.errText}>{failed}</strong></>}
        {' · '}<strong>{remaining}</strong> remaining
      </p>
      {failures.length > 0 && (
        <ul style={S.failList}>
          {failures.map((f) => (
            <li key={f.id} style={S.failItem}>
              <span style={S.failName}>{f.name || f.email || f.id.slice(0, 8)}</span>
              <span style={S.failErr}>{f.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' },
  help: { fontSize: '0.85rem', color: '#4b5563' },
  warn: { fontSize: '0.85rem', color: '#92400e', margin: 0 },
  done: { fontSize: '0.85rem', color: '#166534', margin: 0 },
  err: { color: '#991b1b', fontSize: '0.85rem' },
  muted: { fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' },
  summary: {
    marginTop: '0.5rem',
    padding: '0.75rem 1rem',
    background: 'var(--color-slate-50, #f8fafc)',
    border: '1px solid var(--border, #e5e7eb)',
    borderRadius: 6,
    fontSize: '0.85rem',
  },
  summaryLine: { margin: 0, color: '#374151' },
  okText: { color: '#166534' },
  errText: { color: '#991b1b' },
  failList: {
    margin: '0.5rem 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  failItem: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    fontSize: '0.8rem',
  },
  failName: { fontWeight: 600, color: '#374151' },
  failErr: { color: '#991b1b', fontFamily: 'var(--font-mono, monospace)' },
};
