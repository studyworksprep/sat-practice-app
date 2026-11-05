'use client';

// The manager's teacher table. One row per teacher; flagged rows
// (lib/tutor/team-checkin) are highlighted. Sorting is local — a
// manager's team is a handful of rows.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatRelativeShort } from '@/lib/formatters';
import { checkInWeight, type TeamRow } from '@/lib/tutor/team-checkin';
import s from './Teachers.module.css';

export interface TeamTableRow extends TeamRow {
  email: string | null;
  accuracy7d: number | null;
  attempts7d: number;
  lastActivityAt: string | null;
  /** §5.2 4-week signals. */
  masteryDelta: number | null;
  completionRate: number | null;
  training: { open: number; sessions: number };
  /** "1 on track · 2 no plan" — the adherence rollup beyond `behind`. */
  adherenceDetail: string | null;
  flagged: boolean;
  note: string;
}

const SORTS: Record<string, { label: string; cmp: (a: TeamTableRow, b: TeamTableRow) => number }> = {
  checkin: { label: 'Needs a check-in first', cmp: (a, b) => checkInWeight(b) - checkInWeight(a) || a.name.localeCompare(b.name) },
  name: { label: 'Name', cmp: (a, b) => a.name.localeCompare(b.name) },
  students: { label: 'Most students', cmp: (a, b) => b.students - a.students || a.name.localeCompare(b.name) },
  recent: {
    label: 'Most recent activity',
    cmp: (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') || a.name.localeCompare(b.name),
  },
};

export function TeamTable({ rows }: { rows: TeamTableRow[] }) {
  const [sort, setSort] = useState('checkin');
  const sorted = useMemo(() => [...rows].sort(SORTS[sort].cmp), [rows, sort]);

  return (
    <section className={s.tableCard} aria-labelledby="teachers-heading">
      <div className={s.tableHead}>
        <h2 id="teachers-heading" className={s.tableTitle}>Teachers</h2>
        <label className={s.sortLabel}>
          Sort
          <select className={s.sortSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([key, def]) => <option key={key} value={key}>{def.label}</option>)}
          </select>
        </label>
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Teacher</th>
              <th scope="col" className={s.num}>Students</th>
              <th scope="col">Practiced · 7d</th>
              <th scope="col" className={s.num}>Accuracy · 7d</th>
              <th scope="col" className={s.num}>Plans behind</th>
              <th scope="col" className={s.num}>Overdue work</th>
              <th scope="col" className={s.num} title="Average mastery change across the roster's practiced skills, last 4 weeks">Mastery Δ · 4wk</th>
              <th scope="col" className={s.num} title="Share of assignments sent in the last 4 weeks that were finished">Done · 4wk</th>
              <th scope="col">Own training</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const half = r.students > 0 && r.practicedThisWeek * 2 < r.students;
              return (
                <tr key={r.id} className={r.flagged ? s.rowFlagged : undefined}>
                  <td>
                    <Link href={`/tutor/teachers/${r.id}`} className={s.teacherLink}>{r.name}</Link>
                    <div className={s.subline}>
                      {r.flagged && <span className={s.flagPill}>Check in</span>}
                      {r.lastActivityAt ? `Students active ${formatRelativeShort(r.lastActivityAt)}` : 'No student activity yet'}
                    </div>
                  </td>
                  <td className={s.num}>{r.students}</td>
                  <td className={half ? s.alert : undefined}>
                    {r.students === 0 ? <span className={s.muted}>—</span> : `${r.practicedThisWeek} of ${r.students}`}
                  </td>
                  <td className={s.num}>
                    {r.accuracy7d == null ? <span className={s.muted}>—</span> : `${r.accuracy7d}%`}
                    {r.attempts7d > 0 && <div className={s.subline}>{r.attempts7d.toLocaleString()} q</div>}
                  </td>
                  <td className={`${s.num} ${r.plansBehind > 0 ? s.warn : ''}`}>
                    {r.plansBehind}
                    {r.adherenceDetail && <div className={s.subline}>{r.adherenceDetail}</div>}
                  </td>
                  <td className={`${s.num} ${r.overdue > 0 ? s.alert : ''}`}>{r.overdue}</td>
                  <td className={s.num}>
                    {r.masteryDelta == null ? <span className={s.muted}>—</span> : (
                      <span className={r.masteryDelta > 0 ? s.good : r.masteryDelta < 0 ? s.warn : undefined}>
                        {r.masteryDelta > 0 ? '+' : ''}{r.masteryDelta}
                      </span>
                    )}
                  </td>
                  <td className={s.num}>
                    {r.completionRate == null ? <span className={s.muted}>—</span> : `${Math.round(r.completionRate * 100)}%`}
                  </td>
                  <td className={s.muted}>{trainingLabel(r.training)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={s.tableFoot}>
        Highlighted: fewer than half of the roster practiced this week, or more than five assignments are overdue.
        The 4-week columns are context — rosters are small and start from different levels.
      </p>
    </section>
  );
}

function trainingLabel({ open, sessions }: { open: number; sessions: number }): string {
  const parts: string[] = [];
  if (open > 0) parts.push(`${open} assigned`);
  if (sessions > 0) parts.push(`${sessions} session${sessions === 1 ? '' : 's'} this week`);
  return parts.join(' · ') || '—';
}
