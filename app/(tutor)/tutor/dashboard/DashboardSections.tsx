// Server-rendered dashboard sections: the count tiles, the "Needs your
// attention" summary (how many students have each problem; the roster
// lists them, most urgent first), and "Your students". The data comes
// from lib/tutor/dashboard-attention (pure) via the page.

import Link from 'next/link';
import { formatRelativeShort } from '@/lib/formatters';
import {
  ACTIVITY_LOOKBACK_DAYS,
  IDLE_DAYS,
  type AttentionSummary,
  type DashboardTiles,
  type StudentSignals,
} from '@/lib/tutor/dashboard-attention';
import s from './Dashboard.module.css';

const STUDENTS_LIMIT = 8;

/** The problems buildAttention flags, in the order the card lists them. */
const PROBLEMS: ReadonlyArray<{
  key: 'planBehind' | 'overdueAssignments' | 'idle'; label: string; tone: 'alert' | 'warn';
}> = [
  { key: 'planBehind', label: 'Behind on their study plan', tone: 'alert' },
  { key: 'overdueAssignments', label: 'Overdue assignments', tone: 'alert' },
  { key: 'idle', label: `No practice in ${IDLE_DAYS}+ days`, tone: 'warn' },
];

export function CountTiles({ tiles }: { tiles: DashboardTiles }) {
  return (
    <section aria-label="This week" className={s.tiles}>
      <Tile label="Practiced this week" value={tiles.practicedThisWeek} of={tiles.total} />
      <Tile label="Behind on their plan" value={tiles.behind} tone={tiles.behind > 0 ? 'warn' : undefined} href="/tutor/roster" />
      <Tile label="Overdue assignments" value={tiles.lateAssignments} tone={tiles.lateAssignments > 0 ? 'alert' : undefined} href="/tutor/assignments" />
      <Tile label="Tests in the next 30 days" value={tiles.testsSoon} />
    </section>
  );
}

function Tile({ label, value, of, tone, href }: {
  label: string; value: number; of?: number; tone?: 'warn' | 'alert'; href?: string;
}) {
  const body = (
    <>
      <span className={s.tileLabel}>{label}</span>
      <span className={[s.tileValue, tone ? s[`tileValue_${tone}`] : null].filter(Boolean).join(' ')}>
        {value}
        {of != null && <span className={s.tileOf}> of {of}</span>}
      </span>
    </>
  );
  return href
    ? <Link href={href} className={`${s.tile} ${s.tileLink}`}>{body}</Link>
    : <div className={s.tile}>{body}</div>;
}

export function AttentionSummaryCard({ summary }: { summary: AttentionSummary }) {
  return (
    <section className={s.card} aria-labelledby="attention-heading">
      <div className={s.cardHeader}>
        <div>
          <h2 id="attention-heading" className={s.cardTitle}>Needs your attention</h2>
          <p className={s.cardSub}>
            {summary.students === 0
              ? 'Everyone is on track this week.'
              : `${studentCount(summary.students)} in all. A student can count under more than one problem.`}
          </p>
        </div>
        <Link href="/tutor/roster" className={s.reviewAction}>Roster →</Link>
      </div>
      <ul className={s.problemList}>
        {PROBLEMS.map(({ key, label, tone }) => {
          const n = summary[key];
          return (
            <li key={key} className={s.problemRow}>
              <span className={s.problemLabel}>{label}</span>
              <span className={s.problemCount}>
                <span className={`${s.problemValue} ${n > 0 ? s[`problemValue_${tone}`] : s.problemValue_zero}`}>{n}</span>
                {n === 1 ? ' student' : ' students'}
              </span>
            </li>
          );
        })}
      </ul>
      {summary.students > 0 && (
        <p className={s.cardFoot}>
          The roster lists these students first. Archive anyone you no longer
          tutor (the roster&apos;s ⋯ menu) to take them off these counts.
        </p>
      )}
    </section>
  );
}

export function StudentsPanel({ students, nowMs }: { students: StudentSignals[]; nowMs: number }) {
  // Most recently active first; never-active students last, by name.
  const ordered = [...students].sort((a, b) =>
    (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '') || a.name.localeCompare(b.name));
  const shown = ordered.slice(0, STUDENTS_LIMIT);
  return (
    <aside className={`${s.card} ${s.studentsPanel}`} aria-labelledby="students-heading">
      <div className={s.cardHeader}>
        <h2 id="students-heading" className={s.cardTitle}>Your students</h2>
        <Link href="/tutor/roster" className={s.reviewAction}>Roster →</Link>
      </div>
      <ul className={s.studentList}>
        {shown.map((st) => (
          <li key={st.id}>
            <Link href={`/tutor/students/${st.id}`} prefetch={false} className={s.studentRow}>
              <span className={s.studentMain}>
                <span className={s.studentName}>{st.name}</span>
                <span className={s.studentMeta}>{studentMeta(st, nowMs)}</span>
              </span>
              <span className={s.studentScore}>
                <span className={s.studentScoreValue}>{st.latestScore ?? '—'}</span>
                <span className={s.studentMeta}>{st.goalScore ? `goal ${st.goalScore}` : 'no goal set'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className={s.cardFoot}>
        {students.length > STUDENTS_LIMIT
          ? `Showing the ${STUDENTS_LIMIT} most recently active of ${students.length}. `
          : ''}
        Score is the latest SAT practice test.
      </p>
    </aside>
  );
}

function studentMeta(st: StudentSignals, nowMs: number): string {
  const parts: string[] = [];
  parts.push(st.lastActiveAt
    ? `Active ${formatRelativeShort(st.lastActiveAt)}`
    : `Not active in ${ACTIVITY_LOOKBACK_DAYS}+ days`);
  if (st.testDate) {
    const d = new Date(`${st.testDate.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(d.getTime()) && d.getTime() >= nowMs - 86_400_000) {
      parts.push(`test ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`);
    }
  }
  return parts.join(' · ');
}

function studentCount(n: number): string {
  return `${n} ${n === 1 ? 'student' : 'students'}`;
}
