// Student dashboard layout — the landing page and command center.
// page.js loads and shapes every prop; this composes the boxes:
//
//   1. PageHeader — greeting, the plan's week/phase/target eyebrow and a
//      one-line "what's waiting" description. Self-guided practice is
//      offered at the foot of Coming up, after the plan's own tasks.
//   2. Up next (with a plan) — the one task to do now as the page's
//      single primary action, beside this week's progress and the open
//      session. Without a plan the open session moves into the header.
//   3. Coming up (left) — the rest of today's tasks and the next few
//      ahead, assignments included, with a link to the whole plan.
//   4. Progress (right) — the reduced statistics, with a link to the
//      full Performance page.
//   5. Recently finished — the report links.
//
// Countdown and streak live in the sidebar footer, so they are not
// repeated here.
//
// Server Component. The only client island on the page is HelpNudge
// (localStorage-counted first-visit pointer at the Help guide).

import Link from 'next/link';
import { PageHeader } from '@/lib/ui/PageHeader';
import { HelpNudge } from '../help/HelpNudge';
import { NextUpCard, type NextUpCardProps } from './NextUpCard';
import { TasksCard, type TasksCardProps } from './TasksCard';
import { ProgressCard, type ProgressCardProps } from './ProgressCard';
import { RecentlyFinished, type FinishedEntry } from './RecentlyFinished';
import s from './Dashboard.module.css';

export interface HeaderProps {
  firstName: string | null;
  /** "Week 16 of 20 · Focus · Target 1400"; null without a plan or target. */
  eyebrow: string | null;
  /** One line on what's waiting (catch-up work, today's tasks, or stats). */
  description: string;
  resume: NextUpCardProps['resume'];
}

export interface DashboardViewProps {
  accountCreatedAt: string | null;
  header: HeaderProps;
  /** Present only with an active plan. */
  nextUp: NextUpCardProps | null;
  tasks: TasksCardProps;
  progress: ProgressCardProps;
  recentlyFinished: FinishedEntry[];
}

export function DashboardView({
  accountCreatedAt,
  header,
  nextUp,
  tasks,
  progress,
  recentlyFinished,
}: DashboardViewProps) {
  const greeting = header.firstName ? `Welcome back, ${header.firstName}` : 'Welcome back';
  // With a plan, the open session sits in the Up next card; without one
  // the header is its only home.
  const headerResume = nextUp ? null : header.resume;

  return (
    <main className={s.main}>
      <HelpNudge accountCreatedAt={accountCreatedAt} />

      <PageHeader
        eyebrow={header.eyebrow}
        title={greeting}
        description={header.description}
        actions={headerResume ? (
          <Link
            href={`/practice/s/${headerResume.sessionId}/${headerResume.position}`}
            className={s.btnPrimary}
          >
            Resume session
          </Link>
        ) : undefined}
      />

      {nextUp && <NextUpCard {...nextUp} />}

      <div className={s.grid}>
        <TasksCard {...tasks} />
        <ProgressCard {...progress} />
      </div>

      <RecentlyFinished entries={recentlyFinished} />
    </main>
  );
}
