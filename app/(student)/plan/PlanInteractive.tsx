// Client islands for the plan hub (design doc §6.2 "Adjust"): the
// adjust form (target, test date, hours, days → regenerate the remaining
// weeks in place) and the rebuild button. Both wired to route-local
// Server Actions via useActionState; the hub itself is a Server
// Component that re-reads the plan after each action revalidates.

'use client';

import { useActionState, useState } from 'react';
import type { AdjustResult } from './actions';
import s from './Plan.module.css';

type Action = (prev: AdjustResult | null, fd: FormData) => Promise<AdjustResult>;

const HOUR_OPTIONS = [2, 3, 5, 8, 10, 15];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Result({ state, verb }: { state: AdjustResult | null; verb: string }) {
  if (!state) return null;
  if (!state.ok) return <p className={s.error} role="alert">{state.error}</p>;
  return (
    <p className={s.ok} role="status">
      {verb} — {state.taskCount} tasks across the remaining {state.weeks} week{state.weeks === 1 ? '' : 's'}.
      Completed work and anything your tutor added stayed put.
    </p>
  );
}

export function AdjustPlanForm({
  action,
  defaults,
}: {
  action: Action;
  defaults: { target: number; testDate: string; weeklyHours: number; studyDays: number[] };
}) {
  const [state, formAction, pending] = useActionState<AdjustResult | null, FormData>(action, null);
  const [open, setOpen] = useState(false);
  const days = new Set(defaults.studyDays);
  const hoursPreset = HOUR_OPTIONS.includes(defaults.weeklyHours) ? defaults.weeklyHours : 5;

  if (!open) {
    return (
      <div className={s.adjustRow}>
        <button type="button" className={s.secondaryBtn} onClick={() => setOpen(true)}>
          Change target, date, hours, or days
        </button>
        <Result state={state} verb="Plan updated" />
      </div>
    );
  }

  return (
    <form action={formAction} className={s.form}>
      <div className={s.fieldRow}>
        <label className={s.field}>
          <span className={s.label}>Target score</span>
          <input className={s.input} name="target" type="number" min={400} max={1600} step={10} required defaultValue={defaults.target} />
        </label>
        <label className={s.field}>
          <span className={s.label}>Test date</span>
          <input className={s.input} name="testDate" type="date" required defaultValue={defaults.testDate} />
        </label>
      </div>
      <fieldset className={s.fieldset}>
        <legend className={s.label}>Hours per week</legend>
        <div className={s.chipRow}>
          {HOUR_OPTIONS.map((h) => (
            <label key={h} className={s.chip}>
              <input type="radio" name="weeklyHours" value={h} defaultChecked={hoursPreset === h} />
              <span>{h}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={s.fieldset}>
        <legend className={s.label}>Study days</legend>
        <div className={s.chipRow}>
          {DAY_LABELS.map((label, i) => (
            <label key={label} className={s.chip}>
              <input type="checkbox" name="day" value={i} defaultChecked={days.has(i)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={s.hint}>
        Saving rebuilds the weeks from today onward. Anything you have already finished, and
        anything your tutor added, stays exactly as it is.
      </p>
      <div className={s.adjustRow}>
        <button className={s.primaryBtn} type="submit" disabled={pending}>
          {pending ? 'Updating your plan…' : 'Save and update my plan'}
        </button>
        <button type="button" className={s.linkBtn} onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Result state={state} verb="Plan updated" />
      </div>
    </form>
  );
}

export function RebuildPlanButton({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState<AdjustResult | null, FormData>(action, null);
  return (
    <form action={formAction} className={s.adjustRow}>
      <button className={s.secondaryBtn} type="submit" disabled={pending}>
        {pending ? 'Rebuilding…' : 'Rebuild from my latest practice'}
      </button>
      <span className={s.hint}>
        Same answers, fresh evidence: re-ranks the remaining weeks from what your practice shows now.
      </span>
      <Result state={state} verb="Plan rebuilt" />
    </form>
  );
}
