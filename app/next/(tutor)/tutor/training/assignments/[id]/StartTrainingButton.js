// Tiny client island for the training assignment detail page.
// Hosts the Start/Continue button that fires startTrainingAssignment,
// which materializes a mode='training' practice_sessions row and
// redirects into /tutor/training/practice/s/<sid>/0.

'use client';

import { useActionState } from 'react';
import s from './AssignmentDetail.module.css';

export function StartTrainingButton({ assignmentId, label, disabled, startAction }) {
  const [state, submitAction, isPending] = useActionState(startAction, null);
  return (
    <form action={submitAction} className={s.startForm}>
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <button type="submit" disabled={disabled || isPending} className={s.startBtn}>
        {isPending ? 'Starting…' : label}
      </button>
      {state && !state.ok && (
        <span role="alert" className={s.startError}>{state.error}</span>
      )}
    </form>
  );
}
