// Client islands for the first-run wizard (§6.4). Each step's form
// wires a route-local Server Action via useActionState; the wizard's
// step progression is server-derived (page.tsx re-renders after each
// action revalidates the route), so these islands hold no wizard
// state — just inputs and pending/error affordances.

'use client';

import { useActionState } from 'react';
import type { ActionResult } from '@/lib/types';
import s from './Welcome.module.css';

type WizardAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult | null>;

function ErrorNote({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return <p className={s.error} role="alert">{state.error}</p>;
}

export function GoalForm({
  action,
  defaults,
}: {
  action: WizardAction;
  defaults: { target: number | ''; testDate: string };
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={s.form}>
      <div className={s.fieldRow}>
        <label className={s.field}>
          <span className={s.label}>Target score</span>
          <input
            className={s.input}
            name="target"
            type="number"
            min={400}
            max={1600}
            step={10}
            required
            defaultValue={defaults.target}
            placeholder="1400"
          />
        </label>
        <label className={s.field}>
          <span className={s.label}>Test date</span>
          <input
            className={s.input}
            name="testDate"
            type="date"
            required
            defaultValue={defaults.testDate}
          />
        </label>
      </div>
      <div className={s.actionsRow}>
        <button className={s.primaryBtn} type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Continue'}
        </button>
        <ErrorNote state={state} />
      </div>
    </form>
  );
}

export function StartDiagnosticForm({ action }: { action: WizardAction }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={s.inlineForm}>
      <button className={s.primaryBtn} type="submit" disabled={pending}>
        {pending ? 'Building your set…' : 'Start the diagnostic'}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}

export function GenerateFirstPlanForm({
  action,
  defaultHours,
}: {
  action: WizardAction;
  defaultHours: number;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={s.form}>
      <label className={s.field}>
        <span className={s.label}>Hours you can study per week</span>
        <input
          className={s.input}
          name="weeklyHours"
          type="number"
          min={1}
          max={40}
          step={1}
          required
          defaultValue={defaultHours}
        />
      </label>
      <div className={s.actionsRow}>
        <button className={s.primaryBtn} type="submit" disabled={pending}>
          {pending ? 'Building your plan…' : 'Build my plan'}
        </button>
        <ErrorNote state={state} />
      </div>
    </form>
  );
}

export function ActivateFirstPlanButton({
  action,
  planId,
}: {
  action: WizardAction;
  planId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={s.inlineForm}>
      <input type="hidden" name="planId" value={planId} />
      <button className={s.primaryBtn} type="submit" disabled={pending}>
        {pending ? 'Activating…' : 'Start my plan'}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}
