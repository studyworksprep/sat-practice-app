// Dashboard · Tasks box — the study plan's daily surface, folded into
// the dashboard (2026-09-19; it was the standalone /today page before).
// Since the 2026-11 dashboard layout the first task lives in the Up next
// card (./NextUpCard) as the page's primary action; this box lists what
// comes after it — the rest of today's due tasks, then the next few
// scheduled ahead (startable early) — plus what's already done today. Assignment-mirrored tasks (payload.assignment_id, migration
// 20260919120000) render in the violet "assigned" treatment so tutor
// work stands out from generated work.
//
// Server Component: the selection policy is the pure buildTodayView
// (lib/plan/today.ts), computed by page.js. Starts and manual
// completions are plain <form action> Server Actions (./task-actions),
// so this box adds no client island to the page.
//
// Without a plan the box is the setup callout, plus the student's open
// assignments when they have a tutor — assignments only mirror into a
// plan once one is active, so this is where they live until then.

import Link from 'next/link';
import type { ComponentType } from 'react';
import { formatDate, isPastDueDate } from '@/lib/formatters';
import { MANUAL_COMPLETE_TYPES, taskTitle, taskWhy } from '@/lib/plan/today';
import type { TodayTaskRow, TodayView } from '@/lib/plan/today';
import type { PlanTaskType } from '@/lib/plan/generate-plan';
import {
  BookmarkIcon,
  BookOpenIcon,
  CalendarIcon,
  GraduationCapIcon,
  InboxIcon,
  PencilIcon,
  TargetIcon,
  TestIcon,
} from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { markTaskDone, startPlanTask } from './task-actions';
import s from './Dashboard.module.css';

// The icons live in untyped icons.jsx whose un-defaulted `className`
// destructure infers as a required prop — normalize through `unknown`
// once (same seam as AppSidebar's NAV_ICONS).
type IconComponent = ComponentType<{ size?: number; className?: string }>;
const asIcon = (icon: unknown): IconComponent => icon as IconComponent;

type Palette = 'navy' | 'gold' | 'cyan' | 'success' | 'violet';

const TYPE_ICON: Record<PlanTaskType, { icon: IconComponent; palette: Palette }> = {
  lesson:       { icon: asIcon(GraduationCapIcon), palette: 'cyan' },
  drill:        { icon: asIcon(PencilIcon),        palette: 'gold' },
  practice_set: { icon: asIcon(PencilIcon),        palette: 'gold' },
  review:       { icon: asIcon(TargetIcon),        palette: 'navy' },
  full_test:    { icon: asIcon(TestIcon),          palette: 'success' },
  vocab:        { icon: asIcon(BookOpenIcon),      palette: 'cyan' },
  flashcards:   { icon: asIcon(BookmarkIcon),      palette: 'navy' },
};
const ASSIGNED_ICON = { icon: asIcon(InboxIcon), palette: 'violet' as const };

export interface PendingAssignmentSummary {
  id: string;
  title: string;
  dueDate: string | null;
}

export interface TasksCardProps {
  /** The day's view of the active plan; null when the student has none. */
  view: TodayView | null;
  /** ISO yyyy-mm-dd, the same "today" the view was built for. */
  today: string;
  /** A failed Start / Mark-done lands back here with ?error=. */
  error: string | null;
  /** §2.5: the weekly job re-paced this plan within the last week. */
  wasAutoRepaced: boolean;
  hasTutor: boolean;
  /** The task the Up next card shows — left out of this list. */
  heroTaskId: string | null;
  /** Open assignments, shown only without a plan (with one they are
   *  mirrored into the plan's tasks). */
  pendingAssignments: PendingAssignmentSummary[];
  assignmentsTotal: number;
}

export function TasksCard({
  view,
  today,
  error,
  wasAutoRepaced,
  heroTaskId,
  hasTutor,
  pendingAssignments,
  assignmentsTotal,
}: TasksCardProps) {
  return (
    <section className={`${s.card} ${s.tasksCard}`} aria-labelledby="dashboard-tasks">
      <div className={s.cardHeader}>
        <div>
          <h2 id="dashboard-tasks" className={s.sectionLabel}>
            <IconTile icon={CalendarIcon} palette="gold" size="sm" />
            {view ? 'Coming up' : 'Tasks'}
          </h2>
          <div className={s.cardSub}>
            {view
              ? 'Start any of these early. Finishing a task checks it off.'
              : 'A plan turns your goal into a few tasks a day.'}
          </div>
        </div>
        {view ? (
          <Link href="/plan" className={s.cardHeaderLink}>Full plan →</Link>
        ) : hasTutor && pendingAssignments.length > 0 ? (
          <Link href="/assignments" className={s.cardHeaderLink}>
            {assignmentsTotal > pendingAssignments.length ? 'See all assignments →' : 'Assignments →'}
          </Link>
        ) : null}
      </div>

      {error && (
        <div className={s.errorNote} role="alert">{error}</div>
      )}

      {view ? (
        <PlanTasks view={view} today={today} wasAutoRepaced={wasAutoRepaced} heroTaskId={heroTaskId} />
      ) : (
        <NoPlan hasTutor={hasTutor} pendingAssignments={pendingAssignments} />
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────

function PlanTasks({
  view,
  today,
  wasAutoRepaced,
  heroTaskId,
}: {
  view: TodayView;
  today: string;
  wasAutoRepaced: boolean;
  heroTaskId: string | null;
}) {
  const dueIds = new Set(view.due.map((t) => t.id));
  const rest = view.due.filter((t) => t.id !== heroTaskId);
  const ahead = view.ahead.filter((t) => t.id !== heroTaskId && !dueIds.has(t.id));

  return (
    <>
      {wasAutoRepaced && (
        <div className={s.repaceNote}>
          Your plan was updated this week to match your progress — the tasks
          below reflect where you are now.{' '}
          <Link href="/plan" className={s.inlineLink}>See the plan</Link>
        </div>
      )}

      {view.doneToday.length > 0 && (
        <ul className={s.doneList}>
          {view.doneToday.map((t) => (
            <li key={t.id} className={s.doneRow}>
              <span className={s.doneCheck} aria-hidden="true">✓</span>
              <span className={s.doneTitle}>{taskTitle(t)}</span>
              <span className={s.doneTag}>done</span>
            </li>
          ))}
        </ul>
      )}

      {rest.length + ahead.length > 0 ? (
        <ul className={s.taskList}>
          {rest.map((t) => (
            <TaskRow key={t.id} task={t} today={today} />
          ))}
          {ahead.map((t) => (
            <TaskRow key={t.id} task={t} today={today} upNext />
          ))}
        </ul>
      ) : (
        <p className={s.caughtUpSub}>
          {view.planFinished
            ? 'Every task in your plan is done.'
            : 'Nothing else lined up yet — the plan adds the next tasks as the week goes on.'}
        </p>
      )}
    </>
  );
}

function TaskRow({
  task,
  today,
  upNext = false,
}: {
  task: TodayTaskRow;
  today: string;
  /** A future task offered early: labelled with its date, never "catch-up". */
  upNext?: boolean;
}) {
  const assigned = typeof task.payload.assignment_id === 'string';
  const kind = assigned ? ASSIGNED_ICON : (TYPE_ICON[task.taskType] ?? TYPE_ICON.drill);
  const why = taskWhy(task);
  const minutes = typeof task.payload.minutes === 'number' ? task.payload.minutes : null;
  const overdue = !upNext && task.scheduledDate != null && task.scheduledDate < today;
  // Assignment-linked tasks complete through the assignment, never by hand.
  const manual = MANUAL_COMPLETE_TYPES.includes(task.taskType) && !assigned;
  const className = [s.taskRow, assigned ? s.taskRowAssigned : null].filter(Boolean).join(' ');

  return (
    <li className={className}>
      <IconTile icon={kind.icon} palette={kind.palette} size="md" className={s.taskIcon} />
      <div className={s.taskBody}>
        <div className={s.taskTitleRow}>
          <h3 className={s.taskTitle}>{taskTitle(task)}</h3>
          {assigned && <span className={s.assignedPill}>Assigned</span>}
          {overdue && <span className={s.overduePill}>catch-up</span>}
          {upNext && task.scheduledDate && (
            <span className={s.upNextPill}>
              {formatDate(task.scheduledDate) ?? task.scheduledDate}
            </span>
          )}
        </div>
        {(why || minutes != null) && (
          <div className={s.taskMeta}>
            {why && <span className={s.taskWhy}>{why}</span>}
            {minutes != null && <span className={s.taskMinutes}>~{minutes} min</span>}
          </div>
        )}
      </div>
      <div className={s.taskActions}>
        <form action={startPlanTask}>
          <input type="hidden" name="task_id" value={task.id} />
          <button type="submit" className={s.startBtn}>Start</button>
        </form>
        {manual && (
          <form action={markTaskDone}>
            <input type="hidden" name="task_id" value={task.id} />
            <button type="submit" className={s.doneBtn}>Mark done</button>
          </form>
        )}
      </div>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────

function NoPlan({
  hasTutor,
  pendingAssignments,
}: {
  hasTutor: boolean;
  pendingAssignments: PendingAssignmentSummary[];
}) {
  return (
    <>
      <div className={s.noPlan}>
        <p className={s.noPlanTitle}>No study plan yet</p>
        <p className={s.noPlanBody}>
          A few questions about where you are and when you can study, and you
          get a week-by-week plan built around it — about five minutes. Until
          then, the{' '}
          <Link href="/review" className={s.inlineLink}>Review hub</Link>
          {' '}and{' '}
          <Link href="/practice/start" className={s.inlineLink}>self-guided practice</Link>
          {' '}are the best places to work.
        </p>
        <Link href="/welcome" className={s.btnPrimary}>Set up my plan</Link>
      </div>

      {hasTutor && pendingAssignments.length > 0 && (
        <ul className={`${s.taskList} ${s.taskListAssigned}`}>
          {pendingAssignments.map((a) => (
            <li key={a.id} className={`${s.taskRow} ${s.taskRowAssigned}`}>
              <IconTile icon={InboxIcon} palette="violet" size="md" className={s.taskIcon} />
              <div className={s.taskBody}>
                <div className={s.taskTitleRow}>
                  <h3 className={s.taskTitle}>{a.title}</h3>
                  <span className={s.assignedPill}>Assigned</span>
                </div>
                <div className={s.taskMeta}>
                  <span className={s.taskWhy}>Assigned by your tutor</span>
                  {a.dueDate && (
                    <span className={isPastDueDate(a.dueDate) ? s.taskDueOverdue : s.taskMinutes}>
                      Due {formatDate(a.dueDate) ?? a.dueDate}
                    </span>
                  )}
                </div>
              </div>
              <div className={s.taskActions}>
                <Link href={`/assignments/${a.id}`} className={s.startBtn}>Open</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
