import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { planTaskTitle } from '@/lib/plan/task-labels';
import type { TodayTaskRow, TodayWeek } from '@/lib/plan/today';
import {
  BookOpenIcon, ClipboardCheckIcon, CorrectIcon, FlashcardsIcon, PracticeIcon,
  QuestionBankIcon, ReviewIcon, TestIcon, NotesIcon,
} from '@/lib/ui/icons';
import { startPlanTask } from '../dashboard/task-actions';
import { ViewWeek } from './PlanInteractive';
import s from './Plan.module.css';

const activities = {
  lesson: { name: 'lesson', icon: BookOpenIcon },
  drill: { name: 'drill', icon: PracticeIcon },
  review: { name: 'review', icon: ReviewIcon },
  practice_set: { name: 'practice', icon: QuestionBankIcon },
  full_test: { name: 'test', icon: TestIcon },
  vocab: { name: 'vocabulary', icon: NotesIcon },
  flashcards: { name: 'flashcards', icon: FlashcardsIcon },
};

type Task = TodayTaskRow & { byline?: string; resumeProgress?: string };

interface Props {
  week: TodayWeek | null;
  phase?: string;
  weekClosed: boolean;
  weekTasks: TodayTaskRow[];
  next?: Task;
  today: string;
  finished: boolean;
  skipped: number;
}

function WeeklyProgress({ week, tasks }: { week: TodayWeek | null; tasks: TodayTaskRow[] }) {
  const count = week?.count ?? 0;
  const done = week?.done ?? 0;
  const skipped = week?.skipped ?? 0;
  return <div className={s.weekProgress}>
    <div className={s.meter} aria-hidden="true">
      {count > 0 && count <= 12 ? tasks.map((t) => (
        <span key={t.id} className={s.segment} data-status={t.status}>
          {t.status === 'completed' ? '✓' : t.status === 'skipped' ? '−' : ''}
        </span>
      )) : <div className={s.track}>
        <span className={s.fill} style={{ width: count ? `${100 * done / count}%` : '0%' }} />
        {skipped > 0 && <span className={s.skippedFill} style={{ width: `${100 * skipped / count}%` }} />}
      </div>}
    </div>
    <span className={s.progressCaption}>{count
      ? `${done} of ${count} ${count === 1 ? 'task' : 'tasks'} complete${skipped ? ` · ${skipped} skipped` : ''}`
      : 'No tasks scheduled this week'}</span>
  </div>;
}

export function WeeklyPlanCard({ week, phase, weekClosed, weekTasks, next, today, finished, skipped }: Props) {
  const date = next?.scheduledDate;
  const early = !!(date && date > today && !next?.resumeHref);
  const assigned = typeof next?.payload.assignment_id === 'string';
  const activity = next && (activities[next.taskType] ?? { name: 'task', icon: ClipboardCheckIcon });
  const Icon = assigned ? ClipboardCheckIcon : activity?.icon ?? (finished && !skipped ? CorrectIcon : NotesIcon);
  const status = next?.resumeHref ? 'In progress' : early ? 'Next scheduled' : date && date < today ? 'Catch up' : 'Up next';
  const dateLabel = date === today ? 'Due today' : date && formatDate(date, { weekday: 'short' });
  const meta = next ? [
    `Week ${next.weekIndex + 1}`, next.resumeProgress,
    dateLabel && (date && date < today ? `Due ${dateLabel}` : dateLabel), next.byline,
  ].filter(Boolean).join(' · ') : '';
  return <section className={s.position} aria-labelledby="plan-position">
    <header className={s.weekHeader}>
      <h2 id="plan-position">This week</h2>
      <div className={s.weekHeading}>
        <strong>{week ? `Week ${week.index + 1} of ${week.total}` : 'Your schedule'}</strong>
        {phase && <span className={s.phaseName}>{phase}</span>}
        {weekClosed && <span className={week?.skipped ? s.closedStatus : s.completeStatus}>
          {week?.skipped ? 'Week wrapped up' : <><CorrectIcon size={16} /> Complete</>}
        </span>}
      </div>
    </header>
    <WeeklyProgress week={week} tasks={weekTasks} />
    <div className={s.taskRow}>
      <span className={s.activityIcon} aria-hidden="true"><Icon size={22} /></span>
      <div className={s.taskText}>
        <span className={s.taskState}>{next ? status : 'Plan status'}</span>
        <strong>{next ? planTaskTitle(next.taskType, next.payload)
          : finished ? (skipped ? 'No remaining plan tasks' : 'Plan complete') : 'No tasks scheduled'}</strong>
        <span className={s.taskMeta}>{next ? meta : finished
          ? (skipped ? `${skipped} skipped across the plan` : 'All scheduled tasks completed')
          : 'Your preparation summary is below.'}</span>
      </div>
      <div className={s.actions}>
        {early && next && <ViewWeek week={next.weekIndex} />}
        {next?.resumeHref ? <Link href={next.resumeHref} className={s.primaryLink}>
          Resume {assigned ? 'assignment' : activity?.name}
        </Link> : next ? <form action={startPlanTask}>
          <input type="hidden" name="task_id" value={next.id} />
          <button type="submit" className={early ? s.secondaryBtn : s.primaryBtn}>
            {early ? 'Start early' : assigned ? 'Open assignment' : `Start ${activity?.name}`}
          </button>
        </form> : <a href="#preparation" className={s.primaryLink}>View preparation summary</a>}
      </div>
    </div>
  </section>;
}
