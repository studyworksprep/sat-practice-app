// "Today" view-model builder (upgrade plan §2.3).
//
// PURE: given the active plan's tasks and an as-of date, decide what the
// student should see when the app opens — today's 1–3 tasks, what they
// already finished today, what comes next, and where the current week
// stands. No I/O and `today` is an input (never Date.now()), matching
// the generate-plan.ts pattern, so the selection policy is fully
// unit-testable (lib/plan/today.test.mjs).
//
// Selection policy:
//   - "Due" = pending tasks scheduled on or before today — overdue work
//     surfaces first (oldest first) so a student who missed a day picks
//     up where they left off, not where the calendar says.
//   - Capped at MAX_TODAY_TASKS (3): the whole point of Today is focus.
//     The cap counts what's already done today, so finishing a task
//     doesn't backfill an endless queue: a day is 3 tasks, total.
//   - Undated tasks (a tutor quick-add) count as due immediately.

// Explicit .ts extension so `node --test` (which runs today.test.mjs
// against this module directly, no bundler) can resolve the import;
// tsconfig's allowImportingTsExtensions sanctions it for tsc.
import { daysBetween } from './generate-plan.ts';
import type { PlanTaskType } from './generate-plan.ts';

export const MAX_TODAY_TASKS = 3;

export type PlanTaskStatus = 'pending' | 'completed' | 'skipped';

/** A plan_tasks row, as the Today page reads it. */
export interface TodayTaskRow {
  id: string;
  weekIndex: number;
  scheduledDate: string | null; // ISO yyyy-mm-dd
  taskType: PlanTaskType;
  payload: Record<string, unknown>;
  status: PlanTaskStatus;
  completedAt: string | null;   // ISO timestamp
  source: string;
}

export interface TodayWeek {
  /** 0-based index of the calendar week containing `today`. */
  index: number;
  /** Total weeks in the plan (max week_index + 1). */
  total: number;
  /** Tasks in this week that are completed / total tasks in the week. */
  done: number;
  count: number;
}

export interface TodayView {
  /** What to do now: pending tasks due today or overdue, oldest first. */
  due: TodayTaskRow[];
  /** Tasks completed today — rendered as checked-off wins. */
  doneToday: TodayTaskRow[];
  /** The next pending task scheduled after today (a "what's coming" hint,
   *  shown when today's list is empty or short). */
  upNext: TodayTaskRow | null;
  week: TodayWeek | null;
  /** Days until the plan's test date (0 = today); null without a date. */
  daysToTest: number | null;
  /** True when every task in the plan is completed or skipped. */
  planFinished: boolean;
}

function isCompletedOn(t: TodayTaskRow, todayIso: string): boolean {
  return t.status === 'completed' && (t.completedAt ?? '').slice(0, 10) === todayIso;
}

/** Sort key for due work: undated first (tutor quick-adds), then oldest
 *  scheduled date; stable within a date by week index. */
function dueOrder(a: TodayTaskRow, b: TodayTaskRow): number {
  const da = a.scheduledDate ?? '';
  const db = b.scheduledDate ?? '';
  if (da !== db) return da < db ? -1 : 1;
  return a.weekIndex - b.weekIndex;
}

export function buildTodayView(
  tasks: readonly TodayTaskRow[],
  today: string,
  testDate: string | null,
): TodayView {
  const pending = tasks.filter((t) => t.status === 'pending');

  const doneToday = tasks
    .filter((t) => isCompletedOn(t, today))
    .sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? ''));

  // Today's slots: 3 total, minus what's already done today.
  const slots = Math.max(0, MAX_TODAY_TASKS - doneToday.length);
  const due = pending
    .filter((t) => t.scheduledDate == null || t.scheduledDate <= today)
    .sort(dueOrder)
    .slice(0, slots);

  const futurePending = pending
    .filter((t) => t.scheduledDate != null && t.scheduledDate > today)
    .sort(dueOrder);
  const upNext = futurePending[0] ?? null;

  // Current week: anchor week 0 at the plan's earliest scheduled date and
  // count 7-day windows to today. Falls back to the task-declared
  // week_index bounds so a plan whose dates are all in the future (or
  // past) still reports a sane window.
  let week: TodayWeek | null = null;
  if (tasks.length > 0) {
    const dates = tasks
      .map((t) => t.scheduledDate)
      .filter((d): d is string => Boolean(d))
      .sort();
    const maxIndex = Math.max(...tasks.map((t) => t.weekIndex));
    const total = maxIndex + 1;
    let index = 0;
    if (dates.length > 0) {
      const offset = daysBetween(dates[0], today);
      index = Math.max(0, Math.min(Math.floor(offset / 7), maxIndex));
    }
    const inWeek = tasks.filter((t) => t.weekIndex === index);
    week = {
      index,
      total,
      done: inWeek.filter((t) => t.status !== 'pending').length,
      count: inWeek.length,
    };
  }

  return {
    due,
    doneToday,
    upNext,
    week,
    daysToTest: testDate ? daysBetween(today, testDate) : null,
    planFinished: tasks.length > 0 && pending.length === 0,
  };
}

/** Task types with no automatic completion path yet: lessons don't spawn
 *  sessions, and review/vocab/flashcards queues arrive with Phase 3 SRS.
 *  These get a manual "Mark done" on the Today card; drills and full
 *  tests complete themselves via the plan_task triggers. */
export const MANUAL_COMPLETE_TYPES: readonly PlanTaskType[] = [
  'lesson',
  'review',
  'vocab',
  'flashcards',
];

/** Student-facing fallback title when a task payload doesn't carry one. */
export function taskTitle(t: TodayTaskRow): string {
  const title = t.payload?.title;
  if (typeof title === 'string' && title.trim()) return title;
  switch (t.taskType) {
    case 'lesson': return 'Lesson';
    case 'drill': return 'Skill drill';
    case 'review': return 'Spaced review';
    case 'practice_set': return 'Practice set';
    case 'full_test': return 'Full-length practice test';
    case 'vocab': return 'Vocabulary practice';
    case 'flashcards': return 'Flashcard review';
    default: return 'Study task';
  }
}
