// Plan-editor client islands (§2.4): per-task move / swap / remove
// controls, a per-week regenerate button, and an add-task form.
//
// Same island discipline as StudyPlanInteractive: each control wires a
// route-local Server Action through useActionState for pending + error
// state; the edited schedule itself is re-rendered by the Server
// Component after the action revalidates the route. No client fetch,
// no local copy of the plan.

'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/types';
import styles from './StudyPlan.module.css';

type PlanAction = (
  prev: ActionResult | null,
  fd: FormData,
) => Promise<ActionResult | null>;

export interface UnitOption {
  domainCode: string;
  skillCode: string;
  title: string;
}

function ErrorNote({ state }: { state: ActionResult | null }) {
  if (!state || state.ok) return null;
  return <span className={styles.editError} role="alert">{state.error}</span>;
}

// ── Per-task controls ─────────────────────────────────────────────

interface TaskControlsProps {
  taskId: string;
  studentId: string;
  weekIndex: number;
  weekCount: number;
  /** Only drill / lesson tasks target a curriculum unit. */
  canSwap: boolean;
  units: UnitOption[];
  moveAction: PlanAction;
  swapAction: PlanAction;
  removeAction: PlanAction;
}

export function TaskControls({
  taskId,
  studentId,
  weekIndex,
  weekCount,
  canSwap,
  units,
  moveAction,
  swapAction,
  removeAction,
}: TaskControlsProps) {
  const [moveState, moveFormAction, movePending] = useActionState<ActionResult | null, FormData>(moveAction, null);
  const [swapState, swapFormAction, swapPending] = useActionState<ActionResult | null, FormData>(swapAction, null);
  const [removeState, removeFormAction, removePending] = useActionState<ActionResult | null, FormData>(removeAction, null);
  const pending = movePending || swapPending || removePending;

  return (
    <span className={styles.taskControls}>
      <form action={moveFormAction} className={styles.inlineForm}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="studentId" value={studentId} />
        <select
          name="weekIndex"
          className={styles.editSelect}
          value={weekIndex}
          disabled={pending}
          aria-label="Move to week"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {Array.from({ length: weekCount }, (_, w) => (
            <option key={w} value={w}>Wk {w + 1}</option>
          ))}
        </select>
      </form>

      {canSwap ? (
        <form action={swapFormAction} className={styles.inlineForm}>
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="studentId" value={studentId} />
          <select
            name="unit"
            className={styles.editSelect}
            defaultValue=""
            disabled={pending}
            aria-label="Swap skill"
            onChange={(e) => {
              if (e.currentTarget.value) e.currentTarget.form?.requestSubmit();
            }}
          >
            <option value="" disabled>Swap skill…</option>
            {units.map((u) => (
              <option key={`${u.domainCode}|${u.skillCode}`} value={`${u.domainCode}|${u.skillCode}`}>
                {u.title}
              </option>
            ))}
          </select>
        </form>
      ) : null}

      <form action={removeFormAction} className={styles.inlineForm}>
        <input type="hidden" name="taskId" value={taskId} />
        <input type="hidden" name="studentId" value={studentId} />
        <button
          type="submit"
          className={styles.removeBtn}
          disabled={pending}
          aria-label="Remove task"
          title="Remove task"
        >
          ×
        </button>
      </form>

      <ErrorNote state={moveState ?? swapState ?? removeState} />
    </span>
  );
}

// ── Per-week regenerate ───────────────────────────────────────────

interface RegenerateWeekProps {
  planId: string;
  studentId: string;
  weekIndex: number;
  action: PlanAction;
}

export function RegenerateWeekButton({ planId, studentId, weekIndex, action }: RegenerateWeekProps) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction} className={styles.inlineForm}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="weekIndex" value={weekIndex} />
      <button
        type="submit"
        className={styles.weekBtn}
        disabled={pending}
        title="Replace this week's open generated tasks with a fresh set from current skill data. Your own tasks and completed work stay."
      >
        {pending ? 'Regenerating…' : 'Regenerate'}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}

// ── Add a manual task ─────────────────────────────────────────────

const ADDABLE_TYPES: Array<{ value: string; label: string; needsUnit: boolean }> = [
  { value: 'drill', label: 'Drill', needsUnit: true },
  { value: 'lesson', label: 'Lesson', needsUnit: true },
  { value: 'review', label: 'Review', needsUnit: false },
  { value: 'practice_set', label: 'Practice set', needsUnit: false },
  { value: 'full_test', label: 'Full test', needsUnit: false },
  { value: 'vocab', label: 'Vocabulary', needsUnit: false },
  { value: 'flashcards', label: 'Flashcards', needsUnit: false },
];

interface AddTaskFormProps {
  planId: string;
  studentId: string;
  weekCount: number;
  units: UnitOption[];
  action: PlanAction;
}

export function AddTaskForm({ planId, studentId, weekCount, units, action }: AddTaskFormProps) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const [taskType, setTaskType] = useState('drill');
  const needsUnit = ADDABLE_TYPES.find((t) => t.value === taskType)?.needsUnit ?? false;

  return (
    <form action={formAction} className={styles.addForm}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="studentId" value={studentId} />

      <span className={styles.addLabel}>Add task</span>

      <select
        name="taskType"
        className={styles.editSelect}
        value={taskType}
        onChange={(e) => setTaskType(e.target.value)}
        aria-label="Task type"
      >
        {ADDABLE_TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {needsUnit ? (
        <select name="unit" className={styles.editSelect} required defaultValue="" aria-label="Skill">
          <option value="" disabled>Skill…</option>
          {units.map((u) => (
            <option key={`${u.domainCode}|${u.skillCode}`} value={`${u.domainCode}|${u.skillCode}`}>
              {u.title}
            </option>
          ))}
        </select>
      ) : (
        <input
          name="title"
          className={styles.editInput}
          placeholder="Title"
          required
          maxLength={120}
          aria-label="Task title"
        />
      )}

      <select name="weekIndex" className={styles.editSelect} defaultValue={0} aria-label="Week">
        {Array.from({ length: weekCount }, (_, w) => (
          <option key={w} value={w}>Week {w + 1}</option>
        ))}
      </select>

      <input
        name="why"
        className={styles.editInput}
        placeholder="Why (shown to the student)"
        maxLength={300}
        aria-label="Why this task"
      />

      <button type="submit" className={styles.weekBtn} disabled={pending}>
        {pending ? 'Adding…' : 'Add'}
      </button>
      <ErrorNote state={state} />
    </form>
  );
}
