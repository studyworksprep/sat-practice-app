'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatRelativeShort } from '@/lib/formatters';
import { formatReportTimestamp } from '@/lib/practice/report-dates';
import type { ActivityKind, DashboardActivity } from '@/lib/tutor/dashboard-activity';
import { ReportLink } from './ReportLink';
import s from './Dashboard.module.css';

const FILTERS = [['all', 'All activity'], ['assignment', 'Assignments'], ['practice', 'Practice'], ['test', 'Tests']] as const;

export function ActivityFeed({ activities, students, unavailable = false }: {
  activities: DashboardActivity[]; students: Array<{ id: string; name: string }>; unavailable?: boolean;
}) {
  const [filter, setFilter] = useState<ActivityKind | 'all'>('all');
  const [limit, setLimit] = useState(12);
  const names = new Map(students.map(student => [student.id, student.name]));
  const rows = activities.filter(row => names.has(row.studentId) && (filter === 'all' || row.kind === filter));
  return <section className={s.card} aria-labelledby="activity-heading">
    <div className={s.cardHeader}>
      <div>
        <h2 id="activity-heading" className={s.activityHeading}>Recent activity & progress</h2>
        <p className={s.activityIntro}>Latest updates from the past 14 days.</p>
      </div>
      <Link href="/tutor/performance" className={s.reviewAction}>View performance →</Link>
    </div>
    {unavailable ? <p role="alert" className={s.empty}>Recent activity couldn’t be loaded. Refresh to try again. Student search is still available.</p> : <>
      <div className={s.activityFilters} role="group" aria-label="Filter recent activity">
        {FILTERS.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value}
          onClick={() => { setFilter(value); setLimit(12); }}>{label}</button>)}
      </div>
      <p role="status" className={s.activityIntro}>
        {rows.length ? `Showing ${Math.min(limit, rows.length)} recent updates${rows.length > limit ? ` of ${rows.length} loaded` : ''}.` : 'No recent updates in this category.'}
      </p>
      <ul className={s.activityList}>
        {rows.slice(0, limit).map(row => <li key={row.id} className={s.activityRow}>
          <div className={s.activityBody}>
            <div className={s.activityTop}>
              <Link href={`/tutor/students/${row.studentId}`} prefetch={false} className={s.activityStudent}>{names.get(row.studentId)}</Link>
              <span className={s.activityStatus}>{row.status}</span>
              <time dateTime={row.at} title={formatReportTimestamp(row.at)}>{formatRelativeShort(row.at)}</time>
            </div>
            <div className={s.activityTitle}>{row.title}</div>
            <div className={s.activityDetail}>{row.detail}</div>
          </div>
          <ReportLink href={row.href} studentId={row.studentId} assignmentType={row.kind} className={s.activityAction}>
            {row.action} →
          </ReportLink>
        </li>)}
      </ul>
      {rows.length > limit && <button type="button" className={s.moreActivity} onClick={() => setLimit(value => value + 12)}>Show more activity</button>}
      <p className={s.footnote}>“Marked complete” can include tutor submissions. Open the work to see recorded answers. Question-set sizes are not answer counts.</p>
    </>}
  </section>;
}
