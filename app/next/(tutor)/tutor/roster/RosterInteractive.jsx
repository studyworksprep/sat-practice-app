// Roster interactive — search / status-filter / sort + the
// Quick-edit modal entry point per row. Receives the full roster
// from the Server Component up top so all of the filter / sort
// work runs locally without round-trips.
//
// Sort + filter state lives in plain useState; this is small (a
// roster fits comfortably in memory) so we don't bother with URL
// parameters here.

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { QuickEditModal } from './QuickEditModal';
import s from './Roster.module.css';

const SORTS = {
  name:    { label: 'Name (A→Z)',         cmp: (a, b) => nameOf(a).localeCompare(nameOf(b)) },
  nameDesc:{ label: 'Name (Z→A)',         cmp: (a, b) => nameOf(b).localeCompare(nameOf(a)) },
  target:  { label: 'Target ↑',           cmp: (a, b) => (a.targetScore ?? 0) - (b.targetScore ?? 0) },
  targetDesc: { label: 'Target ↓',        cmp: (a, b) => (b.targetScore ?? 0) - (a.targetScore ?? 0) },
  testDate: { label: 'Test date (soonest)', cmp: (a, b) => dateMs(a.satTestDate) - dateMs(b.satTestDate) },
  testDateDesc: { label: 'Test date (latest)', cmp: (a, b) => dateMs(b.satTestDate) - dateMs(a.satTestDate) },
  graduation:  { label: 'Class (oldest)', cmp: (a, b) => (a.graduationYear ?? 9999) - (b.graduationYear ?? 9999) },
  graduationDesc: { label: 'Class (newest)', cmp: (a, b) => (b.graduationYear ?? 0) - (a.graduationYear ?? 0) },
};

function nameOf(st) {
  return [st.lastName, st.firstName].filter(Boolean).join(', ')
    || st.firstName
    || st.email
    || '—';
}

function dateMs(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function RosterInteractive({ students, canEdit }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active | inactive | all
  const [sort, setSort] = useState('name');
  const [editing, setEditing] = useState(null);

  const trimmed = query.trim().toLowerCase();

  const view = useMemo(() => {
    let rows = students;

    if (statusFilter === 'active') rows = rows.filter((st) => st.isActive);
    else if (statusFilter === 'inactive') rows = rows.filter((st) => !st.isActive);

    if (trimmed) {
      rows = rows.filter((st) => {
        const haystack = [
          st.firstName, st.lastName, st.email, st.highSchool,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(trimmed);
      });
    }

    return [...rows].sort(SORTS[sort]?.cmp ?? SORTS.name.cmp);
  }, [students, trimmed, statusFilter, sort]);

  return (
    <>
      <div className={s.toolbar}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or school…"
          className={s.search}
          aria-label="Search students"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={s.select}
          aria-label="Status filter"
        >
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All statuses</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className={s.select}
          aria-label="Sort order"
        >
          {Object.entries(SORTS).map(([key, def]) => (
            <option key={key} value={key}>{def.label}</option>
          ))}
        </select>
        <span className={s.count}>
          {view.length} of {students.length}
        </span>
      </div>

      {view.length === 0 ? (
        <div className={s.empty}>
          {trimmed
            ? 'No students match that search.'
            : statusFilter === 'inactive'
              ? 'No inactive students.'
              : 'No students on your roster yet.'}
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Name</th>
                <th className={s.th}>Email</th>
                <th className={s.thNum}>Target</th>
                <th className={s.th}>School</th>
                <th className={s.thNum}>Class</th>
                <th className={s.th}>Test date</th>
                <th className={s.thStatus}>Status</th>
                <th className={s.thAction} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {view.map((st) => (
                <tr key={st.id} className={st.isActive ? s.row : `${s.row} ${s.rowInactive}`}>
                  <td className={s.td}>
                    <Link href={`/tutor/students/${st.id}`} className={s.nameLink}>
                      {nameOf(st)}
                    </Link>
                  </td>
                  <td className={s.td}>{st.email ?? <span className={s.muted}>—</span>}</td>
                  <td className={s.tdNum}>{st.targetScore ?? '—'}</td>
                  <td className={s.td}>{st.highSchool ?? <span className={s.muted}>—</span>}</td>
                  <td className={s.tdNum}>{st.graduationYear ?? '—'}</td>
                  <td className={s.td}>
                    {st.satTestDate ? formatDate(st.satTestDate) : <span className={s.muted}>—</span>}
                  </td>
                  <td className={s.tdStatus}>
                    <span className={st.isActive ? s.statusActive : s.statusInactive}>
                      {st.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className={s.tdAction}>
                    {canEdit && (
                      <button
                        type="button"
                        className={s.editBtn}
                        onClick={() => setEditing(st)}
                      >
                        Quick edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <QuickEditModal
          student={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
