import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { MANUAL_COMPLETE_TYPES, taskTitle, taskWhy, type TodayWeek } from '@/lib/plan/today';
import type { DashboardTask } from '@/lib/plan/dashboard-tasks';
import { markTaskDone, startPlanTask } from './task-actions';
import s from './Dashboard.module.css';

export interface NextUpCardProps {
  task: DashboardTask | null;
  today: string;
  hasPlan: boolean;
  week: TodayWeek | null;
  planFinished: boolean;
  planContext: string | null;
}

export function TaskAction({
  task,
  early,
  primary = false,
}: {
  task: DashboardTask;
  early?: boolean;
  primary?: boolean;
}) {
  const actionClass = primary ? (early ? s.nextUpGhost : s.nextUpPrimary) : s.startBtn;
  if (task.resumeHref)
    return (
      <Link className={actionClass} href={task.resumeHref}>
        Resume {task.taskType === 'full_test' ? 'test' : 'practice'}
      </Link>
    );
  if (task.assignmentHref)
    return (
      <Link className={actionClass} href={task.assignmentHref}>
        Open assignment
      </Link>
    );
  const labels = {
    lesson: 'Start lesson',
    drill: 'Start drill',
    practice_set: 'Start practice',
    review: 'Start review',
    full_test: 'Start test',
    vocab: 'Start vocab',
    flashcards: 'Start flashcards',
  };
  return (
    <form action={startPlanTask}>
      <input type="hidden" name="task_id" value={task.id} />
      <button type="submit" className={actionClass}>
        {early ? 'Start early' : labels[task.taskType]}
      </button>
    </form>
  );
}

export function TaskSource({ task }: { task: DashboardTask }) {
  return (
    <>
      {task.byline}
      {!task.outsidePlan && (
        <>
          {task.byline ? ' · ' : ''}Study Plan · Week {task.weekIndex + 1}
        </>
      )}
    </>
  );
}

export function MarkDone({ task, primary = false }: { task: DashboardTask; primary?: boolean }) {
  if (task.assignmentHref || !MANUAL_COMPLETE_TYPES.includes(task.taskType)) return null;
  return (
    <form action={markTaskDone}>
      <input type="hidden" name="task_id" value={task.id} />
      <button type="submit" className={primary ? s.nextUpGhost : s.doneBtn}>
        Mark done
      </button>
    </form>
  );
}

export function NextUpCard({ task, today, hasPlan, week, planFinished, planContext }: NextUpCardProps) {
  const ahead = Boolean(task?.scheduledDate && task.scheduledDate > today);
  const weekDone = week && week.count > 0 && week.count === week.done + week.skipped;
  const heading =
    task && !ahead
      ? taskTitle(task)
      : planFinished
        ? 'Study Plan complete'
        : weekDone
          ? `Week ${week.index + 1} ${week.skipped ? 'wrapped up' : 'complete'}`
          : 'You’re caught up for today';
  const date = task?.scheduledDate && formatDate(task.scheduledDate);
  const why = task && !ahead && taskWhy(task);
  return (
    <section className={s.nextUp} aria-labelledby="dashboard-next-up">
      <div className={s.nextUpMain}>
        <p className={s.nextUpEyebrow}>{ahead || !task ? 'Today' : 'Up next'}</p>
        <h2 className={s.nextUpTitle} id="dashboard-next-up">
          {heading}
        </h2>
        {task && (
          <>
            {ahead && (
              <p className={s.nextUpBody}>
                Next on your schedule · {date}
                <br />
                <strong>{taskTitle(task)}</strong>
              </p>
            )}
            <p className={s.nextUpMeta}>
              <TaskSource task={task} />
              {!ahead && date && (
                <>
                  {' '}
                  · {task.scheduledDate! < today ? 'Catch-up from' : 'Scheduled'} {date}
                </>
              )}
              {typeof task.payload.minutes === 'number' && <> · About {task.payload.minutes} min</>}
            </p>
            {why && <p className={s.nextUpBody}>{why}</p>}
            <div className={s.nextUpActions}>
              <TaskAction task={task} early={ahead} primary />
              {!ahead && <MarkDone task={task} primary />}
            </div>
          </>
        )}
      </div>
      {hasPlan && (
        <div className={s.nextUpSide}>
          <div className={s.weekBlock}>
            <div className={s.weekRow}>
              <strong>Your Study Plan</strong>
              <Link className={s.planLink} href="/plan">
                Full plan →
              </Link>
            </div>
            {planContext && <span className={s.weekMeta}>{planContext}</span>}
            {week && (
              <>
                <div className={s.weekCount}>
                  {week.done} <span className={s.weekCountOf}>of {week.count} plan tasks completed this week{week.skipped > 0 && ` · ${week.skipped} skipped`}</span>
                </div>
                {week.count > 0 && (
                  <progress
                    className={s.planMeter}
                    aria-label="Weekly study plan progress"
                    max={week.count}
                    value={week.done}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
