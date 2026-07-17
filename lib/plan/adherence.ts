// Plan adherence (§2.4): completion vs. schedule, as a real signal —
// on-track / behind / ahead — rather than per-assignment due-date pills.
//
// PURE function in the plan-family pattern (generate-plan.ts, today.ts):
// `today` is an input, no I/O, so the classification is reproducible and
// unit-testable. The DB layer that loads a plan's tasks (an RLS-scoped
// study_plans → plan_tasks join) lives with each surface; both the tutor
// plan page and the roster call this one implementation so the signal
// can never diverge between surfaces ("one computation, one home").
//
// Rules, in plain language:
//   - A task is DUE once its scheduled date is today or earlier.
//     Undated tasks can't be judged against a schedule and are ignored.
//   - SKIPPED tasks were explicitly waved off (by tutor or student) —
//     they count neither as done nor as overdue.
//   - behind    = less than ON_TRACK_RATE of due tasks are completed.
//   - ahead     = every due task is done AND future work is already
//                 completed (the student is working ahead of schedule).
//   - on_track  = everything else with at least one due task.
//   - not_started = nothing due yet and nothing completed (a brand-new
//                 plan is "not started", not "behind").

export interface AdherenceTask {
  scheduledDate: string | null; // ISO yyyy-mm-dd
  status: 'pending' | 'completed' | 'skipped';
}

export type AdherenceStatus = 'on_track' | 'behind' | 'ahead' | 'not_started';

export interface AdherenceSummary {
  status: AdherenceStatus;
  /** Dated, non-skipped tasks with scheduled_date <= today. */
  dueCount: number;
  /** Completed among the due. */
  completedDue: number;
  /** Due and still pending — the "catch up on these" number. */
  overdueCount: number;
  /** Completed tasks scheduled after today (working ahead). */
  completedAhead: number;
  /** completedDue / dueCount, 0-1; null when nothing is due yet. */
  completionRate: number | null;
}

/** Below this share of due tasks completed, the student is behind. */
export const ON_TRACK_RATE = 0.8;

export function computeAdherence(
  tasks: readonly AdherenceTask[],
  today: string,
): AdherenceSummary {
  let dueCount = 0;
  let completedDue = 0;
  let overdueCount = 0;
  let completedAhead = 0;

  for (const t of tasks) {
    if (t.status === 'skipped' || !t.scheduledDate) continue;
    if (t.scheduledDate <= today) {
      dueCount++;
      if (t.status === 'completed') completedDue++;
      else overdueCount++;
    } else if (t.status === 'completed') {
      completedAhead++;
    }
  }

  const completionRate = dueCount > 0 ? completedDue / dueCount : null;

  let status: AdherenceStatus;
  if (dueCount === 0) {
    status = completedAhead > 0 ? 'ahead' : 'not_started';
  } else if ((completionRate ?? 0) < ON_TRACK_RATE) {
    status = 'behind';
  } else if (overdueCount === 0 && completedAhead > 0) {
    status = 'ahead';
  } else {
    status = 'on_track';
  }

  return { status, dueCount, completedDue, overdueCount, completedAhead, completionRate };
}

export const ADHERENCE_LABELS: Record<AdherenceStatus, string> = {
  on_track: 'On track',
  behind: 'Behind',
  ahead: 'Ahead',
  not_started: 'Not started',
};

/** One-line human summary, e.g. "Behind · 5 of 12 done, 7 overdue". */
export function adherenceSummaryLine(a: AdherenceSummary): string {
  if (a.dueCount === 0 && a.completedAhead === 0) return 'No tasks due yet';
  if (a.dueCount === 0) return `${a.completedAhead} done ahead of schedule`;
  const base = `${a.completedDue} of ${a.dueCount} due done`;
  return a.overdueCount > 0 ? `${base}, ${a.overdueCount} overdue` : base;
}
