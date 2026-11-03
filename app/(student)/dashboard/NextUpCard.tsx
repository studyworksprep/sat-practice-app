// Dashboard · Up next — the one thing to do now, as the page's single
// primary action. The task is the oldest due plan task (catch-up work
// first, the same order buildTodayView uses), or — when today is clear —
// the next task scheduled ahead. Beside it: this week's progress and the
// open practice session, if any.
//
// Server Component: Start / Mark done are the same <form action> Server
// Actions the Tasks box uses (./task-actions).

import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { MANUAL_COMPLETE_TYPES, taskTitle, taskWhy } from '@/lib/plan/today';
import type { TodayTaskRow, TodayWeek } from '@/lib/plan/today';
import { markTaskDone, startPlanTask } from './task-actions';
import s from './Dashboard.module.css';

const START_LABEL: Record<string, string> = {
  lesson: 'Start lesson',
  drill: 'Start drill',
  practice_set: 'Start practice',
  review: 'Start review',
  full_test: 'Start test',
  vocab: 'Start vocab',
  flashcards: 'Start flashcards',
};

export interface NextUpCardProps {
  /** null when nothing is due and nothing is scheduled ahead. */
  task: TodayTaskRow | null;
  /** The task is scheduled after today (offered early). */
  ahead: boolean;
  today: string;
  week: TodayWeek | null;
  planFinished: boolean;
  doneTodayCount: number;
  resume: { sessionId: string; position: number; total: number } | null;
}

export function NextUpCard({
  task,
  ahead,
  today,
  week,
  planFinished,
  doneTodayCount,
  resume,
}: NextUpCardProps) {
  return (
    <section className={s.nextUp} aria-labelledby="dashboard-next-up">
      <div className={s.nextUpMain}>
        {task ? (
          <TaskHero task={task} ahead={ahead} today={today} />
        ) : (
          <>
            <p className={s.nextUpEyebrow}>Up next</p>
            <h2 id="dashboard-next-up" className={s.nextUpTitle}>
              {planFinished
                ? 'Plan complete — every task is done.'
                : doneTodayCount > 0
                  ? 'That’s today done. Nice work.'
                  : 'Nothing due today.'}
            </h2>
            {!planFinished && (
              <p className={s.nextUpBody}>
                Want more anyway? The Review hub always has something worth drilling.
              </p>
            )}
            <div className={s.nextUpActions}>
              <Link href="/review" className={s.nextUpPrimary}>Go to Review</Link>
            </div>
          </>
        )}
      </div>

      <div className={s.nextUpSide}>
        {week && (
          <div className={s.weekBlock}>
            <div className={s.weekRow}>
              <span className={s.weekLabel}>This week</span>
              <span className={s.weekMeta}>Week {week.index + 1} of {week.total}</span>
            </div>
            <div className={s.weekCount}>
              {week.done} <span className={s.weekCountOf}>of {week.count} tasks</span>
            </div>
            <div
              className={s.weekBar}
              role="progressbar"
              aria-label="Tasks done this week"
              aria-valuemin={0}
              aria-valuemax={week.count}
              aria-valuenow={week.done}
            >
              <div
                className={s.weekFill}
                style={{ width: `${week.count > 0 ? Math.round((week.done / week.count) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}
        {resume && (
          <div className={s.resumeBlock}>
            <div>
              <div className={s.resumeTitle}>Open session</div>
              <div className={s.resumeMeta}>
                At question {Math.min(resume.position + 1, resume.total)} of {resume.total}
              </div>
            </div>
            <Link
              href={`/practice/s/${resume.sessionId}/${resume.position}`}
              className={s.resumeBtn}
            >
              Resume
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function TaskHero({ task, ahead, today }: { task: TodayTaskRow; ahead: boolean; today: string }) {
  const assigned = typeof task.payload.assignment_id === 'string';
  const overdue = !ahead && task.scheduledDate != null && task.scheduledDate < today;
  const why = taskWhy(task);
  const minutes = typeof task.payload.minutes === 'number' ? task.payload.minutes : null;
  const manual = MANUAL_COMPLETE_TYPES.includes(task.taskType) && !assigned;
  const scheduled = task.scheduledDate ? formatDate(task.scheduledDate) ?? task.scheduledDate : null;

  const eyebrow = assigned
    ? 'Up next · assigned by your tutor'
    : overdue
      ? `Up next · catch-up${scheduled ? ` from ${scheduled}` : ''}`
      : ahead && scheduled
        ? `Up next · scheduled ${scheduled}`
        : 'Up next';

  return (
    <>
      <p className={s.nextUpEyebrow}>{eyebrow}</p>
      <h2 id="dashboard-next-up" className={s.nextUpTitle}>{taskTitle(task)}</h2>
      {why && <p className={s.nextUpBody}>{why}</p>}
      {minutes != null && <p className={s.nextUpMeta}>About {minutes} min</p>}
      <div className={s.nextUpActions}>
        <form action={startPlanTask}>
          <input type="hidden" name="task_id" value={task.id} />
          <button type="submit" className={s.nextUpPrimary}>
            {START_LABEL[task.taskType] ?? 'Start'}
          </button>
        </form>
        {manual && (
          <form action={markTaskDone}>
            <input type="hidden" name="task_id" value={task.id} />
            <button type="submit" className={s.nextUpGhost}>Mark done</button>
          </form>
        )}
      </div>
    </>
  );
}
