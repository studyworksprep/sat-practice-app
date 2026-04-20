'use client';

import { useActionState } from 'react';
import { formatDate } from '@/lib/formatters';
import { Button } from '@/lib/ui/Button';
import { importStudentPracticeHistory } from './actions';

export function ImportPracticeHistoryButton({ studentId, importedAt, hasV1History }) {
  const [state, formAction, pending] = useActionState(importStudentPracticeHistory, null);

  const effectiveImportedAt = state?.ok && state.data?.importedAt
    ? state.data.importedAt
    : importedAt;

  if (effectiveImportedAt) {
    return (
      <p style={S.done}>
        Practice history imported on {formatDate(effectiveImportedAt) || '—'}.
      </p>
    );
  }

  if (!hasV1History) {
    return (
      <p style={S.muted}>
        No legacy practice history to import.
      </p>
    );
  }

  return (
    <form action={formAction} style={S.form}>
      <input type="hidden" name="student_id" value={studentId} />
      <p style={S.help}>
        Copy this student&apos;s legacy practice-test attempts into the new
        v2 schema. One-time, idempotent.
      </p>
      <div style={S.row}>
        <Button type="submit" disabled={pending}>
          {pending ? 'Importing…' : 'Import practice history'}
        </Button>
        {state?.ok && !pending && state.data && !state.data.alreadyImported && (
          <span style={S.ok}>
            Copied {state.data.attempts_copied} attempt{state.data.attempts_copied === 1 ? '' : 's'},{' '}
            {state.data.module_attempts_copied} module attempt{state.data.module_attempts_copied === 1 ? '' : 's'},{' '}
            {state.data.item_attempts_copied} item attempt{state.data.item_attempts_copied === 1 ? '' : 's'}.
          </span>
        )}
        {state?.ok === false && !pending && <span style={S.err}>{state.error}</span>}
      </div>
    </form>
  );
}


const S = {
  form: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  help: { fontSize: '0.85rem', color: '#4b5563', margin: 0 },
  row: { display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' },
  done: { fontSize: '0.85rem', color: '#166534', margin: 0 },
  muted: { fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 },
  ok: { color: '#166534', fontSize: '0.85rem' },
  err: { color: '#991b1b', fontSize: '0.85rem' },
};
