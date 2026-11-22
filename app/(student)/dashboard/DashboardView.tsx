import Link from 'next/link';
import { PageHeader } from '@/lib/ui/PageHeader';
import { HelpNudge } from '../help/HelpNudge';
import { NextUpCard, type NextUpCardProps } from './NextUpCard';
import { TasksCard, type TasksCardProps } from './TasksCard';
import { ProgressCard, type ProgressCardProps } from './ProgressCard';
import { RecentlyFinished, type FinishedEntry } from './RecentlyFinished';
import s from './Dashboard.module.css';

interface DashboardViewProps {
  accountCreatedAt: string | null;
  header: { firstName: string | null; tutors: string[] };
  nextUp: NextUpCardProps | null;
  tasks: TasksCardProps;
  resume: { id: string; title: string; position: number; total: number } | null;
  progress: ProgressCardProps;
  recentlyFinished: FinishedEntry[];
}

export function DashboardView({
  accountCreatedAt,
  header,
  nextUp,
  tasks,
  resume,
  progress,
  recentlyFinished,
}: DashboardViewProps) {
  const greeting = header.firstName ? `Welcome back, ${header.firstName}` : 'Welcome back';
  return (
    <main className={s.main}>
      <HelpNudge accountCreatedAt={accountCreatedAt} />
      <PageHeader
        title={greeting}
        description={
          header.tutors.length > 0 && (
            <>
              <strong>{header.tutors.length === 1 ? 'Your tutor' : 'Your tutors'}</strong>
              {' · '}
              {new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(header.tutors)}
            </>
          )
        }
      />
      {nextUp && <NextUpCard {...nextUp} />}
      <div className={s.grid}>
        <div className={s.workColumn}>
          <TasksCard {...tasks} />
          <section className={s.card} aria-labelledby="independent-practice">
            <div className={s.cardHeader}>
              <h2 className={s.sectionLabel} id="independent-practice">
                Independent practice
              </h2>
              <Link href="/practice/start" className={s.cardHeaderLink}>
                Build a practice set →
              </Link>
            </div>
            {resume && (
              <div className={s.practiceRow}>
                <div>
                  <strong>{resume.title}</strong>
                  <div className={s.taskMeta}>
                    Question {Math.min(resume.position + 1, resume.total)} of {resume.total}
                  </div>
                </div>
                <Link className={s.startBtn} href={`/practice/s/${resume.id}/${resume.position}`}>
                  Resume
                </Link>
              </div>
            )}
          </section>
        </div>
        <ProgressCard {...progress} />
      </div>
      <RecentlyFinished entries={recentlyFinished} />
    </main>
  );
}
