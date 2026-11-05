'use client';

// Recent work — the last 14 days of activity, grouped by the viewer's
// local day, with one student's self-guided practice sets on the same
// day folded into one row (lib/tutor/dashboard-activity groupRecentWork).
// Client island: the day grouping needs the viewer's timezone, and the
// filter chips and "Show earlier" are local state.

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { formatReportTimestamp } from '@/lib/practice/report-dates';
import { groupRecentWork, type ActivityKind, type DashboardActivity } from '@/lib/tutor/dashboard-activity';
import { ReportLink } from './ReportLink';
import s from './Dashboard.module.css';

const FILTERS = [['all', 'All'], ['assignment', 'Assignments'], ['practice', 'Practice'], ['test', 'Tests']] as const;
const DAYS_PER_PAGE = 3;
const KIND_LABEL: Record<ActivityKind, string> = { assignment: 'Assignment', practice: 'Practice', test: 'Test' };

// True only in the browser: the server render can't know the viewer's
// timezone, so it shows a placeholder instead of day groups that would
// disagree with the client's on hydration.
const noopSubscribe = () => () => {};
function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(day: string): string {
  const today = localDay(new Date().toISOString());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (day === today) return 'Today';
  if (day === localDay(y.toISOString())) return 'Yesterday';
  const [yr, mo, da] = day.split('-').map(Number);
  return new Date(yr, mo - 1, da).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function ActivityFeed({ activities, students, unavailable = false }: {
  activities: DashboardActivity[]; students: Array<{ id: string; name: string }>; unavailable?: boolean;
}) {
  const [filter, setFilter] = useState<ActivityKind | 'all'>('all');
  const [dayCount, setDayCount] = useState(DAYS_PER_PAGE);
  const isClient = useIsClient();
  const names = useMemo(() => new Map(students.map((st) => [st.id, st.name])), [students]);
  const days = useMemo(() => groupRecentWork(
    activities.filter((row) => names.has(row.studentId) && (filter === 'all' || row.kind === filter)),
    localDay,
  ), [activities, names, filter]);
  const shown = days.slice(0, dayCount);

  return (
    <section className={s.card} aria-labelledby="activity-heading">
      <div className={s.cardHeader}>
        <div>
          <h2 id="activity-heading" className={s.cardTitle}>Recent work</h2>
          <p className={s.cardSub}>The last 14 days, newest first.</p>
        </div>
        {!unavailable && (
          <div className={s.activityFilters} role="group" aria-label="Filter recent work">
            {FILTERS.map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={filter === value}
                onClick={() => { setFilter(value); setDayCount(DAYS_PER_PAGE); }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {unavailable ? (
        <p role="alert" className={s.empty}>Recent work couldn&apos;t be loaded. Refresh to try again.</p>
      ) : !isClient ? (
        <p className={s.empty}>Loading recent work…</p>
      ) : days.length === 0 ? (
        <p role="status" className={s.empty}>Nothing in this category in the last 14 days.</p>
      ) : (
        <>
          {shown.map(({ day, rows }) => (
            <div key={day} className={s.dayGroup}>
              <h3 className={s.dayLabel}>{dayLabel(day)}</h3>
              <ul className={s.activityList}>
                {rows.map((row) => (
                  <li key={row.id} className={s.activityRow}>
                    <div className={s.activityBody}>
                      <div className={s.activityTitle}>
                        <Link href={`/tutor/students/${row.studentId}`} prefetch={false} className={s.activityStudent}>
                          {names.get(row.studentId)}
                        </Link>
                        {' · '}{row.title}
                        {row.kind !== 'practice' && <span className={s.kindPill}>{KIND_LABEL[row.kind]}</span>}
                      </div>
                      <div className={s.activityDetail}>
                        {row.status} · {row.detail} ·{' '}
                        <time dateTime={row.at} title={formatReportTimestamp(row.at)}>
                          {new Date(row.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </time>
                      </div>
                    </div>
                    <ReportLink href={row.href} studentId={row.studentId} assignmentType={row.kind} className={s.activityAction}>
                      {row.action} →
                    </ReportLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {days.length > dayCount && (
            <button type="button" className={s.moreActivity} onClick={() => setDayCount((n) => n + DAYS_PER_PAGE)}>
              Show earlier
            </button>
          )}
          <p className={s.footnote}>
            &ldquo;Marked complete&rdquo; can include tutor submissions. Open the work to see
            recorded answers. Question-set sizes are not answer counts.
          </p>
        </>
      )}
    </section>
  );
}
