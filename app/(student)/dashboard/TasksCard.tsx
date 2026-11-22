import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { taskTitle } from '@/lib/plan/today';
import type { DashboardTask, dashboardTasks } from '@/lib/plan/dashboard-tasks';
import { MarkDone, TaskAction, TaskSource } from './NextUpCard';
import s from './Dashboard.module.css';

export interface TasksCardProps {
  agenda: ReturnType<typeof dashboardTasks>;
  today: string;
  error: string | null;
  hasPlan: boolean;
  wasAutoRepaced: boolean;
}

function TaskList({ tasks, title, today }: { tasks: DashboardTask[]; title: string; today: string }) {
  if (!tasks.length) return null;
  return (
    <div>
      <h3 className={s.groupLabel}>{title}</h3>
      <ul className={s.taskList}>
        {tasks.map((task) => (
          <li key={task.id} className={task.assignmentHref ? `${s.taskRow} ${s.taskRowAssigned}` : s.taskRow}>
            <div className={s.taskBody}>
              <strong className={s.taskTitle}>{taskTitle(task)}</strong>
              <div className={s.taskMeta}>
                <TaskSource task={task} />
              </div>
              {task.scheduledDate && (
                <div className={s.taskMeta}>
                  {task.scheduledDate < today ? 'Catch-up from' : task.outsidePlan ? 'Due' : 'Scheduled'}{' '}
                  {formatDate(task.scheduledDate)}
                  {typeof task.payload.minutes === 'number' && <> · {task.payload.minutes} min</>}
                </div>
              )}
            </div>
            <div className={s.taskActions}>
              <TaskAction task={task} early={task.scheduledDate != null && task.scheduledDate > today} />
              <MarkDone task={task} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TasksCard({ agenda, today, error, hasPlan, wasAutoRepaced }: TasksCardProps) {
  const due = agenda.due.filter((t) => t.id !== agenda.hero?.id);
  const ahead = agenda.ahead.filter((t) => t.id !== agenda.hero?.id);
  return (
    <section className={`${s.card} ${s.tasksCard}`} aria-labelledby="dashboard-tasks">
      <h2 id="dashboard-tasks" className={s.sectionLabel}>
        Your tasks
      </h2>
      {error && (
        <p role="alert" className={s.errorNote}>
          {error}
        </p>
      )}
      {wasAutoRepaced && (
        <p className={s.repaceNote}>Your Study Plan was updated this week to match your progress.</p>
      )}
      <TaskList tasks={due.slice(0, 3)} title="Due now" today={today} />
      {due.length > 3 && (
        <details className={s.remainingDue}>
          <summary>{due.length - 3} more due</summary>
          <TaskList tasks={due.slice(3)} title="Also due" today={today} />
        </details>
      )}
      <TaskList tasks={ahead} title="Coming up" today={today} />
      {agenda.done.length > 0 && (
        <details>
          <summary className={s.groupLabel}>Completed today ({agenda.done.length})</summary>
          <ul className={s.doneList}>
            {agenda.done.map((t) => (
              <li key={t.id} className={s.doneRow}>
                ✓ {taskTitle(t)}{' '}
                <span className={s.taskMinutes}>
                  <TaskSource task={t} />
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {!due.length && !ahead.length && !agenda.done.length && (
        <p className={s.cardSub}>{agenda.hero ? 'No other tasks scheduled.' : 'No tasks scheduled.'}</p>
      )}
      {!hasPlan && (
        <Link href="/welcome" className={s.inlineLink}>
          Set up my Study Plan →
        </Link>
      )}
    </section>
  );
}
