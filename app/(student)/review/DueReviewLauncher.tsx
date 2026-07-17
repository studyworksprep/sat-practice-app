// "Due for review" launcher — tiny client island, sibling of
// WeakQueueLauncher. No size picker: the session takes what's due
// (capped server-side), because the whole point of spaced
// repetition is doing today's reviews, not choosing a workload.

'use client';

import { useActionState } from 'react';
import s from './Review.module.css';

type LauncherState = { ok: boolean; error?: string } | null;
type LauncherAction = (prev: LauncherState, formData: FormData) => Promise<LauncherState>;

export function DueReviewLauncher({ createAction }: { createAction: LauncherAction }) {
  const [state, submitAction, isPending] = useActionState(createAction, null);

  return (
    <form action={submitAction} className={s.launcherRow}>
      <button type="submit" className={s.launcherBtn} disabled={isPending}>
        {isPending ? 'Starting…' : 'Start reviews →'}
      </button>
      {state && !state.ok && (
        <span role="alert" className={s.launcherError}>
          {state.error}
        </span>
      )}
    </form>
  );
}
