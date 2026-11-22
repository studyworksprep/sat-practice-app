// Client islands for the tutor Study Plan page (§2.4).
//
// Two small forms, each wired to a route-local Server Action via
// useActionState so we get pending + error state without any client
// fetch. The draft itself is rendered by the Server Component (which
// re-reads plan_tasks after the action revalidates the route) — these
// islands only own the inputs and the submit/pending/error affordances.

'use client';

import { PlanSectionField } from '@/lib/ui/PlanSectionField';
import type { SectionFocus } from '@/lib/plan/section-focus';
import { useActionState, useState } from 'react';
import Link from 'next/link';
import type { ActionResult } from '@/lib/types';
import styles from './StudyPlan.module.css';

type PlanAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult | null>;

interface GenerateFormProps {
  studentId: string;
  action: PlanAction;
  defaults: { goalScore: number | ''; testDate: string; weeklyHours: number; sectionFocus: SectionFocus };
  profileTarget: number | null;
  /** True when an active plan already exists — regeneration produces a
   *  fresh draft to review; the active plan is left untouched until the
   *  draft is activated. */
  hasActive: boolean;
}

export function GeneratePlanForm({ studentId, action, defaults, profileTarget, hasActive }: GenerateFormProps) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const [creationMode, setCreationMode] = useState('automatic');

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="studentId" value={studentId} />

      <fieldset className={styles.creationModes} disabled={pending}>
        <legend className={styles.label}>How would you like to build the plan?</legend>
        <label><input type="radio" name="creationMode" value="automatic" checked={creationMode === 'automatic'} onChange={() => setCreationMode('automatic')} /> Generate a starting plan</label>
        <label><input type="radio" name="creationMode" value="blank" checked={creationMode === 'blank'} onChange={() => setCreationMode('blank')} /> Start from scratch</label>
      </fieldset>
      <p className={styles.cardSub}>
        {creationMode === 'blank'
          ? 'Create an empty draft, then add units and tasks. Any previous draft is saved in history.'
          : 'Build from current skills. Tutor additions, moves, and removals are kept when regenerating.'}
      </p>
      {creationMode === 'automatic' && <PlanSectionField styles={styles} defaultValue={defaults.sectionFocus} />}
      <div className={styles.fieldRow}>
        {profileTarget != null ? <div className={styles.field}>
          <span className={styles.label}>Target score</span>
          <span>{profileTarget} · From student profile</span>
          <Link href={`/tutor/students/${studentId}`} className={styles.cardSub}>Edit student profile</Link>
        </div> : <label className={styles.field}>
          <span className={styles.label}>Target score</span>
          <input
            className={styles.input}
            name="goalScore"
            type="number"
            min={400}
            max={1600}
            step={10}
            required
            defaultValue={defaults.goalScore}
            placeholder="1400"
          />
        </label>}

        <label className={styles.field}>
          <span className={styles.label}>Test date</span>
          <input
            className={styles.input}
            name="testDate"
            type="date"
            required
            defaultValue={defaults.testDate}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Hours / week</span>
          <input
            className={styles.input}
            name="weeklyHours"
            type="number"
            min={1}
            max={40}
            step={1}
            required
            defaultValue={defaults.weeklyHours}
          />
        </label>
      </div>

      <div className={styles.actionsRow}>
        <button className={styles.primaryBtn} type="submit" disabled={pending}>
          {pending ? 'Preparing draft…' : creationMode === 'blank' ? 'Create blank draft' : hasActive ? 'Regenerate draft' : 'Generate plan'}
        </button>
        {state && !state.ok ? (
          <p className={styles.error} role="alert">{state.error}</p>
        ) : state && state.ok ? (
          <p className={styles.success}>Draft ready — add or edit work below, then activate it.</p>
        ) : null}
      </div>
    </form>
  );
}

interface ActivateButtonProps {
  planId: string;
  studentId: string;
  action: PlanAction;
}

export function ActivatePlanButton({ planId, studentId, action }: ActivateButtonProps) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={styles.activateForm}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="studentId" value={studentId} />
      <button className={styles.primaryBtn} type="submit" disabled={pending}>
        {pending ? 'Activating…' : 'Activate this plan'}
      </button>
      {state && !state.ok ? (
        <p className={styles.error} role="alert">{state.error}</p>
      ) : null}
    </form>
  );
}
