// Cohort student summary table for /tutor/performance.
//
// Shows every student on the roster with their starting / final
// score, impact, target, and target-reach % — the same numbers
// the per-student detail page and the Roster's past-students
// view compute via buildArchiveSummary. Defaults to active
// students; a toggle adds archived students to the view so a
// tutor can scan the whole arc in one place.
//
// Sort + pagination state is local (useState); the roster fits
// comfortably in memory and no URL params are needed. 10 rows
// per page keeps the panel from dominating the page. Sort and
// archived-toggle reset the page index so the first 10 rows
// are always what the tutor sees after changing the lens.

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import s from './Performance.module.css';

const PAGE_SIZE = 10;

const SORTS = {
  name: {
    label: 'Name (A→Z)',
    cmp: (a, b) => nameOf(a).localeCompare(nameOf(b)),
  },
  startingDesc: {
    label: 'Starting (high → low)',
    cmp: (a, b) => (b.startingScore ?? -Infinity) - (a.startingScore ?? -Infinity),
  },
  finalDesc: {
    label: 'Final (high → low)',
    cmp: (a, b) => (b.finalScore ?? -Infinity) - (a.finalScore ?? -Infinity),
  },
  impactDesc: {
    label: 'Impact (high → low)',
    cmp: (a, b) => (b.impact ?? -Infinity) - (a.impact ?? -Infinity),
  },
  targetDesc: {
    label: 'Target (high → low)',
    cmp: (a, b) => (b.targetScore ?? -Infinity) - (a.targetScore ?? -Infinity),
  },
  reachDesc: {
    label: 'Reach (high → low)',
    cmp: (a, b) => (b.targetReachPct ?? -Infinity) - (a.targetReachPct ?? -Infinity),
  },
};

function nameOf(st) {
  return [st.lastName, st.firstName].filter(Boolean).join(', ')
    || st.firstName
    || st.email
    || '—';
}

export function CohortStudentsTable({ students }) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const rows = includeArchived
      ? students
      : students.filter((st) => st.isActive);
    return [...rows].sort(SORTS[sort]?.cmp ?? SORTS.name.cmp);
  }, [students, includeArchived, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const start = clampedPage * PAGE_SIZE;
  const pageRows = filtered.slice(start, start + PAGE_SIZE);

  // Any control change resets to page 0 so the tutor sees the
  // first 10 of the newly filtered/sorted view.
  function onToggleArchived(next) {
    setIncludeArchived(next);
    setPage(0);
  }
  function onChangeSort(next) {
    setSort(next);
    setPage(0);
  }

  return (
    <>
      <div className={s.cohortToolbar}>
        <label className={s.cohortToggle}>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => onToggleArchived(e.target.checked)}
          />
          Include archived
        </label>
        <select
          value={sort}
          onChange={(e) => onChangeSort(e.target.value)}
          className={s.cohortSelect}
          aria-label="Sort order"
        >
          {Object.entries(SORTS).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>
        <span className={s.cohortCount}>
          {filtered.length === 0
            ? '0 students'
            : `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyTitle}>
            {includeArchived
              ? 'No students on this roster yet.'
              : 'No active students.'}
          </div>
          <div className={s.emptyBody}>
            {includeArchived
              ? 'Add a student or wait for an invite to be accepted.'
              : 'Toggle "Include archived" to see past students.'}
          </div>
        </div>
      ) : (
        <>
          <div className={s.cohortTableWrap}>
            <table className={s.cohortTable}>
              <thead>
                <tr>
                  <th className={s.cohortTh}>Name</th>
                  <th className={s.cohortThNum}>Starting</th>
                  <th className={s.cohortThNum}>Final</th>
                  <th className={s.cohortThNum}>Impact</th>
                  <th className={s.cohortThNum}>Target</th>
                  <th className={s.cohortThNum}>Reach</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((st) => (
                  <tr
                    key={st.id}
                    className={st.isActive ? s.cohortRow : `${s.cohortRow} ${s.cohortRowInactive}`}
                  >
                    <td className={s.cohortTd}>
                      <Link href={`/tutor/students/${st.id}`} className={s.cohortNameLink}>
                        {nameOf(st)}
                      </Link>
                      {!st.isActive && (
                        <span className={s.cohortArchivedTag}>Archived</span>
                      )}
                    </td>
                    <td className={s.cohortTdNum}>{st.startingScore ?? '—'}</td>
                    <td className={s.cohortTdNum}>{st.finalScore ?? '—'}</td>
                    <td className={s.cohortTdNum}>
                      {st.impact == null ? (
                        '—'
                      ) : (
                        <span className={impactToneClass(st.impact)}>
                          {st.impact > 0 ? '+' : ''}{st.impact}
                        </span>
                      )}
                    </td>
                    <td className={s.cohortTdNum}>{st.targetScore ?? '—'}</td>
                    <td className={s.cohortTdNum}>
                      {st.targetReachPct == null ? (
                        '—'
                      ) : (
                        <span className={reachToneClass(st.targetReachPct)}>
                          {st.targetReachPct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={s.cohortPager}>
              <button
                type="button"
                className={s.cohortPagerBtn}
                disabled={clampedPage === 0}
                onClick={() => setPage(clampedPage - 1)}
              >
                ← Prev
              </button>
              <span className={s.cohortPagerInfo}>
                Page {clampedPage + 1} of {totalPages}
              </span>
              <button
                type="button"
                className={s.cohortPagerBtn}
                disabled={clampedPage >= totalPages - 1}
                onClick={() => setPage(clampedPage + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function impactToneClass(impact) {
  if (impact > 0) return s.cohortImpactPositive;
  if (impact < 0) return s.cohortImpactNegative;
  return s.cohortMuted;
}

function reachToneClass(pct) {
  if (pct >= 100) return s.cohortReachHit;
  if (pct >= 90) return s.cohortReachClose;
  if (pct >= 75) return s.cohortReachMid;
  return s.cohortReachLow;
}
