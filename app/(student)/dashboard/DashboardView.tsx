// Student dashboard layout — the landing page and command center.
// page.js loads and shapes every prop; this composes the boxes:
//
//   1. Banner — greeting, the plan's week/phase line (or a stats line
//      without a plan), target / accuracy / days-to-test chips, and the
//      Resume + Free-practice links. No primary button: the Tasks box
//      below carries the day's Start buttons.
//   2. Tasks (left) — today's plan tasks, assignments included, with a
//      link to the whole plan.
//   3. Progress (right) — the reduced statistics, with a link to the
//      full Performance page.
//   4. Recently finished — the report links.
//
// Server Component. The only client island on the page is HelpNudge
// (localStorage-counted first-visit pointer at the Help guide).

import Link from 'next/link';
import { HelpNudge } from '../help/HelpNudge';
import { TasksCard, type TasksCardProps } from './TasksCard';
import { ProgressCard, type ProgressCardProps } from './ProgressCard';
import { RecentlyFinished, type FinishedEntry } from './RecentlyFinished';
import s from './Dashboard.module.css';

export interface BannerProps {
  firstName: string | null;
  /** "Week 3 of 12 · Focus · 2 of 5 tasks done this week" when a plan is
   *  active; otherwise a stats line. */
  subline: string;
  targetScore: number | null;
  accuracy: number | null;
  /** Negative = the test has passed; null = no date anywhere. */
  daysToTest: number | null;
  resume: { sessionId: string; position: number } | null;
}

export interface DashboardViewProps {
  accountCreatedAt: string | null;
  banner: BannerProps;
  tasks: TasksCardProps;
  progress: ProgressCardProps;
  recentlyFinished: FinishedEntry[];
}

export function DashboardView({
  accountCreatedAt,
  banner,
  tasks,
  progress,
  recentlyFinished,
}: DashboardViewProps) {
  const greeting = banner.firstName ? `Welcome back, ${banner.firstName}.` : 'Welcome back.';

  return (
    <main className={s.main}>
      <HelpNudge accountCreatedAt={accountCreatedAt} />

      <section className={s.banner}>
        <div className={s.bannerText}>
          <h1 className={s.bannerGreeting}>{greeting}</h1>
          <div className={s.bannerSub}>{banner.subline}</div>
          <div className={s.bannerChips}>
            <span className={`${s.bannerChip} ${s.bannerChipAccent}`}>
              Target · {banner.targetScore ?? 'Not set'}
            </span>
            {banner.accuracy != null && (
              <span className={s.bannerChip}>Accuracy · {banner.accuracy}%</span>
            )}
            {banner.daysToTest != null && (
              <span className={s.bannerChip}>{countdownLabel(banner.daysToTest)}</span>
            )}
          </div>
        </div>
        <div className={s.bannerActions}>
          {banner.resume ? (
            <>
              <Link href="/practice/start" className={s.bannerLink}>Free practice</Link>
              <Link
                href={`/practice/s/${banner.resume.sessionId}/${banner.resume.position}`}
                className={s.btnSecondary}
              >
                Resume session
              </Link>
            </>
          ) : (
            <Link href="/practice/start" className={s.btnSecondary}>Free practice</Link>
          )}
        </div>
      </section>

      <div className={s.grid}>
        <TasksCard {...tasks} />
        <ProgressCard {...progress} />
      </div>

      <RecentlyFinished entries={recentlyFinished} />
    </main>
  );
}

function countdownLabel(days: number): string {
  if (days < 0) return 'Test passed';
  if (days === 0) return 'Test day';
  return `${days} day${days === 1 ? '' : 's'} to test day`;
}
