// Student · Today — the study plan's daily surface (§2.3) and the
// sidebar's anchor item. The app opens to *what to do next*, not a menu:
// today's 1–3 tasks with one-tap starts and plain-language why-this copy,
// what's already done today, the current week's progress, and the
// countdown to test day.
//
// Server Component: the active plan + its tasks load here; the selection
// policy is the pure buildTodayView (lib/plan/today.ts). Task starts and
// manual completions are plain <form action> Server Actions (./actions) —
// no client island on this page at all. Completion state stays honest
// automatically: drills stamp plan_task_id onto the session they spawn
// and full tests match naturally (§2.1 triggers), so finishing the work
// and returning here shows it checked off.

import Link from 'next/link';
import type { ComponentType } from 'react';
import { requireUser } from '@/lib/api/auth';
import { formatDate } from '@/lib/formatters';
import { buildTodayView, taskTitle, MANUAL_COMPLETE_TYPES } from '@/lib/plan/today';
import type { TodayTaskRow } from '@/lib/plan/today';
import type { PlanTaskType } from '@/lib/plan/generate-plan';
import {
  BookmarkIcon,
  BookOpenIcon,
  GraduationCapIcon,
  PencilIcon,
  TargetIcon,
  TestIcon,
} from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { startPlanTask, markTaskDone } from './actions';
import s from './Today.module.css';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

// Task-type icon + tile palette. Icons come straight from the shared SVG
// system; the palette leans on the same tones the dashboard cards use.
// The icons live in untyped icons.jsx whose un-defaulted `className`
// destructure infers as a required prop — normalize through `unknown`
// once (same seam as AppSidebar's NAV_ICONS).
type IconComponent = ComponentType<{ size?: number; className?: string }>;
const asIcon = (icon: unknown): IconComponent => icon as IconComponent;

const TYPE_ICON: Record<PlanTaskType, { icon: IconComponent; palette: 'navy' | 'gold' | 'cyan' | 'success' }> = {
  lesson:       { icon: asIcon(GraduationCapIcon), palette: 'cyan' },
  drill:        { icon: asIcon(PencilIcon),        palette: 'gold' },
  practice_set: { icon: asIcon(PencilIcon),        palette: 'gold' },
  review:       { icon: asIcon(TargetIcon),        palette: 'navy' },
  full_test:    { icon: asIcon(TestIcon),          palette: 'success' },
  vocab:        { icon: asIcon(BookOpenIcon),      palette: 'cyan' },
  flashcards:   { icon: asIcon(BookmarkIcon),      palette: 'navy' },
};

export default async function TodayPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { user, profile, supabase } = await requireUser();
  const firstName = profile.first_name ?? null;

  // The student's live plan. SAT first if a student somehow has both.
  const { data: plan } = await supabase
    .from('study_plans')
    .select('id, test_type, goal_score, test_date, config, created_by, created_at')
    .eq('student_id', user.id)
    .eq('status', 'active')
    .order('test_type', { ascending: false }) // 'sat' > 'act'
    .limit(1)
    .maybeSingle();

  if (!plan) {
    return (
      <main className={s.container}>
        <Header firstName={firstName} daysToTest={null} goalScore={null} />
        <section className={s.emptyCard}>
          <h2 className={s.emptyTitle}>No study plan yet</h2>
          <p className={s.emptyBody}>
            Set one up in about ten minutes — pick a target, take a short
            diagnostic, and get a week-by-week plan built around where you
            are. (If you work with a tutor, they can set it up with you
            too.) Until then, the{' '}
            <Link href="/review" className={s.inlineLink}>Review hub</Link>
            {' '}and{' '}
            <Link href="/practice/start" className={s.inlineLink}>self-guided practice</Link>
            {' '}are the best places to work.
          </p>
          <p className={s.emptyBody}>
            <Link href="/welcome" className={s.inlineLink}>
              Set up my study plan →
            </Link>
          </p>
        </section>
      </main>
    );
  }

  const { data: taskRows } = await supabase
    .from('plan_tasks')
    .select('id, week_index, scheduled_date, task_type, payload, status, completed_at, source')
    .eq('plan_id', plan.id)
    .order('scheduled_date', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });

  const tasks: TodayTaskRow[] = (taskRows ?? []).map((t) => ({
    id: t.id,
    weekIndex: t.week_index,
    scheduledDate: t.scheduled_date,
    taskType: t.task_type as PlanTaskType,
    payload: (t.payload ?? {}) as Record<string, unknown>,
    status: (t.status ?? 'pending') as TodayTaskRow['status'],
    completedAt: t.completed_at,
    source: t.source ?? 'generated',
  }));

  const today = new Date().toISOString().slice(0, 10);
  const view = buildTodayView(tasks, today, plan.test_date);

  // §2.5: the weekly job auto-applies re-paced plans for self-serve
  // students, marked by created_by = null. Tell the student their plan
  // changed (for its first week) rather than silently reshuffling.
  const planAgeDays =
    (Date.parse(today) - Date.parse(String(plan.created_at).slice(0, 10))) / 86_400_000;
  const wasAutoRepaced = plan.created_by == null && planAgeDays <= 7;

  return (
    <main className={s.container}>
      <Header
        firstName={firstName}
        daysToTest={view.daysToTest}
        goalScore={plan.goal_score}
      />

      {wasAutoRepaced && (
        <div className={s.repaceNote}>
          Your plan was updated this week to match your progress — the
          schedule below reflects where you are now.
        </div>
      )}

      {sp.error && (
        <div className={s.errorCard} role="alert">{sp.error}</div>
      )}

      {/* ---------- Done today ---------- */}
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

      {/* ---------- Today's tasks ---------- */}
      {view.due.length > 0 ? (
        <div className={s.taskList}>
          {view.due.map((t, i) => (
            <TaskCard key={t.id} task={t} isPrimary={i === 0} today={today} />
          ))}
        </div>
      ) : (
        <section className={s.caughtUpCard}>
          <h2 className={s.caughtUpTitle}>
            {view.planFinished
              ? 'Plan complete — every task is done.'
              : view.doneToday.length > 0
                ? 'That’s today done. Nice work.'
                : 'Nothing due today.'}
          </h2>
          {view.upNext && (
            <p className={s.caughtUpSub}>
              Up next: <strong>{taskTitle(view.upNext)}</strong>
              {view.upNext.scheduledDate
                ? ` · ${formatDate(view.upNext.scheduledDate) ?? view.upNext.scheduledDate}`
                : ''}
            </p>
          )}
          {!view.planFinished && !view.upNext && (
            <p className={s.caughtUpSub}>
              Want more anyway? The{' '}
              <Link href="/review" className={s.inlineLink}>Review hub</Link>
              {' '}always has something worth drilling.
            </p>
          )}
        </section>
      )}

      {/* ---------- Week progress ---------- */}
      {view.week && view.week.count > 0 && (
        <section className={s.weekCard}>
          <div className={s.weekHeader}>
            <span className={s.weekLabel}>
              Week {view.week.index + 1} of {view.week.total}
            </span>
            <span className={s.weekCount}>
              {view.week.done} of {view.week.count} tasks done
            </span>
          </div>
          <div
            className={s.weekBar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={view.week.count}
            aria-valuenow={view.week.done}
          >
            <div
              className={s.weekFill}
              style={{ width: `${Math.round((view.week.done / view.week.count) * 100)}%` }}
            />
          </div>
        </section>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function Header({
  firstName,
  daysToTest,
  goalScore,
}: {
  firstName: string | null;
  daysToTest: number | null;
  goalScore: number | null;
}) {
  return (
    <header className={s.header}>
      <div>
        <div className={s.eyebrow}>Today</div>
        <h1 className={s.h1}>
          {firstName ? `What’s next, ${firstName}` : 'What’s next'}
        </h1>
      </div>
      <div className={s.headerPills}>
        {goalScore != null && (
          <span className={s.pill}>Target <strong>{goalScore}</strong></span>
        )}
        {daysToTest != null && daysToTest >= 0 && (
          <span className={`${s.pill} ${s.pillCountdown}`}>
            {daysToTest === 0
              ? 'Test day — rest up'
              : `${daysToTest} day${daysToTest === 1 ? '' : 's'} to test`}
          </span>
        )}
      </div>
    </header>
  );
}

function TaskCard({
  task,
  isPrimary,
  today,
}: {
  task: TodayTaskRow;
  isPrimary: boolean;
  today: string;
}) {
  const kind = TYPE_ICON[task.taskType] ?? TYPE_ICON.drill;
  const why = typeof task.payload.why === 'string' ? task.payload.why : null;
  const minutes = typeof task.payload.minutes === 'number' ? task.payload.minutes : null;
  const overdue = task.scheduledDate != null && task.scheduledDate < today;
  const manual = MANUAL_COMPLETE_TYPES.includes(task.taskType);

  return (
    <section className={isPrimary ? `${s.taskCard} ${s.taskCardPrimary}` : s.taskCard}>
      <IconTile
        icon={kind.icon}
        palette={kind.palette}
        size="md"
        className={s.taskIcon}
      />
      <div className={s.taskBody}>
        <div className={s.taskTitleRow}>
          <h2 className={s.taskTitle}>{taskTitle(task)}</h2>
          {overdue && <span className={s.overduePill}>catch-up</span>}
        </div>
        <div className={s.taskMeta}>
          {why && <span className={s.taskWhy}>{why}</span>}
          {minutes != null && (
            <span className={s.taskMinutes}>~{minutes} min</span>
          )}
        </div>
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
    </section>
  );
}
