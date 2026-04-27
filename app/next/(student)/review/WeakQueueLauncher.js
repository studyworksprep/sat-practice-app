// Weak-queue launcher — size picker + Start button.
//
// Tiny client island. The student can pick a drill size (5, 10, 15,
// 20, 25) and the form submits to createWeakQueueDrill, which
// scores the queue server-side and redirects into the runner.

'use client';

import { useActionState } from 'react';
import s from './Review.module.css';

const SIZES = [5, 10, 15, 20, 25];
const DEFAULT_SIZE = 10;

export function WeakQueueLauncher({ queueCount, createAction }) {
  const [state, submitAction, isPending] = useActionState(createAction, null);
  const maxOption = Math.max(5, Math.min(SIZES[SIZES.length - 1], queueCount));

  return (
    <form action={submitAction} className={s.launcherRow}>
      <label className={s.launcherField}>
        Drill size
        <select
          name="size"
          defaultValue={Math.min(DEFAULT_SIZE, maxOption)}
          className={s.launcherSelect}
        >
          {SIZES.filter((n) => n <= maxOption).map((n) => (
            <option key={n} value={n}>{n} questions</option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className={s.launcherBtn}
        disabled={isPending || queueCount === 0}
      >
        {isPending ? 'Starting…' : 'Start drill →'}
      </button>

      {state && !state.ok && (
        <span role="alert" className={s.launcherError}>
          {state.error}
        </span>
      )}
    </form>
  );
}
