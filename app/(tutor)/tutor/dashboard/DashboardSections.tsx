// Server-rendered dashboard sections: the count tiles, "Needs your
// attention", and "Your students". The data comes from
// lib/tutor/dashboard-attention (pure) via the page.

import Link from 'next/link';
import { formatRelativeShort } from '@/lib/formatters';
import {
  ACTIVITY_LOOKBACK_DAYS,
  type AttentionRow,
  type DashboardTiles,
  type StudentSignals,
} from '@/lib/tutor/dashboard-attention';
import s from './Dashboard.module.css';

const ATTENTION_LIMIT = 6;
const STUDENTS_LIMIT = 8;

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

export function AttentionCard({ rows }: { rows: AttentionRow[] }) {
  const shown = rows.slice(0, ATTENTION_LIMIT);
  return (
    <section className={s.card} aria-labelledby="attention-heading">
      <div className={s.cardHeader}>
        <h2 id="attention-heading" className={s.cardTitle}>Needs your attention</h2>
        {rows.length > 0 && <span className={s.cardHeaderHint}>Most urgent first</span>}
      </div>
      {rows.length === 0 ? (
        <p className={s.empty}>
          Everyone is on track: no plan is behind, nothing you assigned is
          overdue, and every student practiced in the last week.
        </p>
      ) : (
        <ul className={s.attentionList}>
          {shown.map(({ student, reasons }) => (
            <li key={student.id} className={s.attentionRow}>
              <span className={s.avatar} aria-hidden="true">{initials(student.name)}</span>
              <div className={s.attentionBody}>
                <Link href={`/tutor/students/${student.id}`} prefetch={false} className={s.attentionName}>
                  {student.name}
                </Link>
                <ul className={s.reasonList} aria-label={`Why ${student.name} is listed`}>
                  {reasons.map((r) => (
                    <li key={r.label} className={`${s.reason} ${s[`reason_${r.tone}`]}`}>{r.label}</li>
                  ))}
                </ul>
              </div>
              <div className={s.attentionActions}>
                <Link href={`/tutor/students/${student.id}/plan`} prefetch={false} className={s.btnSecondary}>
                  {student.hasPlan ? 'Open plan' : 'Build plan'}
                </Link>
                <Link href={`/tutor/session/${student.id}`} prefetch={false} className={s.btnDark}>
                  Start session
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length > ATTENTION_LIMIT && (
        <p className={s.cardFoot}>
          {rows.length - ATTENTION_LIMIT} more need attention.{' '}
          <Link href="/tutor/roster" className={s.reviewAction}>See the roster →</Link>
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

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '?';
}
