// Small client island for the assignment detail page. Hosts the
// "Start / Continue" form that kicks off a practice session via the
// startAssignmentPractice Server Action. All of the static detail
// content is rendered by the Server Component in page.js — this file
// is intentionally minimal, per the §3.4 guideline of keeping 'use
// client' surface area small.

'use client';

import { useActionState } from 'react';
import { TIME_ACCOMMODATIONS, TIME_ACCOMMODATION_LABELS } from '@/lib/practice/time-accommodation';
import { Button } from '@/lib/ui/Button';

export function StartAssignmentButton({ assignmentId, label, disabled, startAction, defaultTimeMultiplier }) {
  const [state, submitAction, isPending] = useActionState(startAction, null);

  return (
    <form action={submitAction} style={{ display: 'inline' }}>
      <input type="hidden" name="assignment_id" value={assignmentId} />
      {defaultTimeMultiplier != null && (
        <div style={{ marginBottom: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            Time accommodation
            <select name="time_multiplier" defaultValue={defaultTimeMultiplier} disabled={isPending}
              style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 6 }}>
              {TIME_ACCOMMODATIONS.map(value => (
                <option key={value} value={value}>{TIME_ACCOMMODATION_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0.375rem 0 0' }}>
            Applies to this attempt. Choosing different timing starts a new attempt.
          </p>
        </div>
      )}
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
