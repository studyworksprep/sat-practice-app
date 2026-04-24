// Single-skill drill button — renders inline on each Common
// Errors row. Submits the skill name as a hidden field to
// createSkillDrill, which picks a batch of that skill's weakest
// questions and starts a review session.

'use client';

import { useActionState } from 'react';
import s from './Review.module.css';

const DEFAULT_SIZE = 10;

export function SkillDrillButton({ skillName, createAction }) {
  const [state, submitAction, isPending] = useActionState(createAction, null);
  return (
    <form action={submitAction} className={s.skillDrillForm}>
      <input type="hidden" name="skill" value={skillName} />
      <input type="hidden" name="size" value={DEFAULT_SIZE} />
      <button type="submit" className={s.skillDrillBtn} disabled={isPending}>
        {isPending ? 'Starting…' : 'Drill →'}
      </button>
      {state && !state.ok && (
        <span role="alert" className={s.skillDrillError}>
          {state.error}
        </span>
      )}
    </form>
  );
}
