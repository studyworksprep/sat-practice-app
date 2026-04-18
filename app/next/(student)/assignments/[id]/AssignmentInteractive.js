// Small client island for the assignment detail page. Hosts the
// "Start / Continue" form that kicks off a practice session via the
// startAssignmentPractice Server Action. All of the static detail
// content is rendered by the Server Component in page.js — this file
// is intentionally minimal, per the §3.4 guideline of keeping 'use
// client' surface area small.

'use client';

import { useActionState } from 'react';
import { Button } from '@/lib/ui/Button';

export function StartAssignmentButton({ assignmentId, label, disabled, startAction }) {
  const [state, submitAction, isPending] = useActionState(startAction, null);

  return (
    <form action={submitAction} style={{ display: 'inline' }}>
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <Button type="submit" disabled={disabled || isPending}>
        {isPending ? 'Starting…' : label}
      </Button>
      {state && !state.ok && (
        <span role="alert" style={{ color: '#b91c1c', marginLeft: '0.75rem', fontSize: '0.875rem' }}>
          {state.error}
        </span>
      )}
    </form>
  );
}
