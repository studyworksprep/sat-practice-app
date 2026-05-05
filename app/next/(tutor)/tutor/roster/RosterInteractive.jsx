// Roster interactive — search / status-filter / sort + per-row
// Quick-edit and Archive / Restore actions. Receives the full
// roster from the Server Component up top so all of the filter +
// sort work runs locally without round-trips.
//
// Two table shapes share the surface:
//
//   Active view    — Name / Email / Target / School / Class / Status / Actions
//   Archived view  — Name / Starting / Final / Impact / Target / Reach / Actions
//
// The archived view's columns are the only signals a tutor cares
// about for past students: where they started, where they ended,
// how much we moved them, and how close they got to the goal.
// All other detail still lives on the per-student profile page,
// which stays accessible.
//
// Sort + filter state lives in plain useState; the roster fits
// comfortably in memory so we don't round-trip via URL parameters.
// Switching the status filter to "inactive" implicitly switches
// the table shape too — kept that mode-coupling here rather than
// a separate tab UI to keep the surface lean.

'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QuickEditModal } from './QuickEditModal';
import { updateStudentProfile } from './actions';
import s from './Roster.module.css';

// Sort definitions for the active view.
const ACTIVE_SORTS = {
  name:    { label: 'Name (A→Z)',         cmp: (a, b) => nameOf(a).localeCompare(nameOf(b)) },
  nameDesc:{ label: 'Name (Z→A)',         cmp: (a, b) => nameOf(b).localeCompare(nameOf(a)) },
  target:  { label: 'Target ↑',           cmp: (a, b) => (a.targetScore ?? 0) - (b.targetScore ?? 0) },
  targetDesc: { label: 'Target ↓',        cmp: (a, b) => (b.targetScore ?? 0) - (a.targetScore ?? 0) },
  graduation:  { label: 'Class (oldest)', cmp: (a, b) => (a.graduationYear ?? 9999) - (b.graduationYear ?? 9999) },
  graduationDesc: { label: 'Class (newest)', cmp: (a, b) => (b.graduationYear ?? 0) - (a.graduationYear ?? 0) },
};

// Sort definitions for the archived view. Different cohort, so
// "best impact first" / "highest final" make more sense than
// "name A→Z" — though name remains as the default for predictable
// scanning.
const ARCHIVED_SORTS = {
  name:    { label: 'Name (A→Z)',         cmp: (a, b) => nameOf(a).localeCompare(nameOf(b)) },
  impactDesc: {
    label: 'Impact (high → low)',
    cmp:   (a, b) => (b.archive?.impact ?? -Infinity) - (a.archive?.impact ?? -Infinity),
  },
  finalDesc: {
    label: 'Final (high → low)',
    cmp:   (a, b) => (b.archive?.finalScore ?? -Infinity) - (a.archive?.finalScore ?? -Infinity),
  },
  reachDesc: {
    label: 'Target reach (high → low)',
    cmp:   (a, b) => (b.archive?.targetReachPct ?? -Infinity) - (a.archive?.targetReachPct ?? -Infinity),
  },
};

function nameOf(st) {
  return [st.lastName, st.firstName].filter(Boolean).join(', ')
    || st.firstName
    || st.email
    || '—';
}

export function RosterInteractive({ students, canEdit }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active | inactive | all
  const [activeSort, setActiveSort] = useState('name');
  const [archivedSort, setArchivedSort] = useState('name');
  const [editing, setEditing] = useState(null);

  const showingArchived = statusFilter === 'inactive';
  const sort = showingArchived ? archivedSort : activeSort;
  const SORTS = showingArchived ? ARCHIVED_SORTS : ACTIVE_SORTS;

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
  }, [students, trimmed, statusFilter, sort, SORTS]);

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
          <option value="active">Active</option>
          <option value="inactive">Past students</option>
          <option value="all">All statuses</option>
        </select>
        <select
          value={sort}
          onChange={(e) => (showingArchived ? setArchivedSort(e.target.value) : setActiveSort(e.target.value))}
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
            : showingArchived
              ? 'No past students yet. Archive a student to move them here.'
              : 'No students on your roster yet.'}
        </div>
      ) : showingArchived ? (
        <ArchivedTable students={view} canEdit={canEdit} />
      ) : (
        <ActiveTable students={view} canEdit={canEdit} onEdit={setEditing} />
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

// ──────────────────────────────────────────────────────────────

function ActiveTable({ students, canEdit, onEdit }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th}>Name</th>
            <th className={s.th}>Email</th>
            <th className={s.thNum}>Target</th>
            <th className={s.th}>School</th>
            <th className={s.thNum}>Class</th>
            <th className={s.thAction} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {students.map((st) => (
            <tr key={st.id} className={s.row}>
              <td className={s.td}>
                <Link href={`/tutor/students/${st.id}`} className={s.nameLink}>
                  {nameOf(st)}
                </Link>
              </td>
              <td className={s.td}>{st.email ?? <span className={s.muted}>—</span>}</td>
              <td className={s.tdNum}>{st.targetScore ?? '—'}</td>
              <td className={s.td}>{st.highSchool ?? <span className={s.muted}>—</span>}</td>
              <td className={s.tdNum}>{st.graduationYear ?? '—'}</td>
              <td className={s.tdAction}>
                {canEdit && (
                  <div className={s.actionRow}>
                    <button
                      type="button"
                      className={s.editBtn}
                      onClick={() => onEdit(st)}
                    >
                      Quick edit
                    </button>
                    <ArchiveButton studentId={st.id} archive />
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ArchivedTable({ students, canEdit }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th}>Name</th>
            <th className={s.thNum}>Starting</th>
            <th className={s.thNum}>Final</th>
            <th className={s.thNum}>Impact</th>
            <th className={s.thNum}>Target</th>
            <th className={s.thNum}>Reach</th>
            <th className={s.thAction} aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {students.map((st) => {
            const a = st.archive ?? {};
            return (
              <tr key={st.id} className={`${s.row} ${s.rowInactive}`}>
                <td className={s.td}>
                  <Link href={`/tutor/students/${st.id}`} className={s.nameLink}>
                    {nameOf(st)}
                  </Link>
                </td>
                <td className={s.tdNum}>{a.startingScore ?? '—'}</td>
                <td className={s.tdNum}>{a.finalScore ?? '—'}</td>
                <td className={s.tdNum}>
                  {a.impact == null
                    ? '—'
                    : <span className={impactToneClass(a.impact, s)}>
                        {a.impact > 0 ? '+' : ''}{a.impact}
                      </span>}
                </td>
                <td className={s.tdNum}>{st.targetScore ?? '—'}</td>
                <td className={s.tdNum}>
                  {a.targetReachPct == null
                    ? '—'
                    : <span className={reachToneClass(a.targetReachPct, s)}>
                        {a.targetReachPct}%
                      </span>}
                </td>
                <td className={s.tdAction}>
                  {canEdit && <ArchiveButton studentId={st.id} archive={false} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ArchiveButton({ studentId, archive }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={archive ? s.archiveBtn : s.restoreBtn}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const res = await updateStudentProfile({
            studentId,
            patch: { is_active: archive ? false : true },
          });
          if (res?.ok) router.refresh();
        });
      }}
    >
      {pending ? '…' : archive ? 'Archive' : 'Restore'}
    </button>
  );
}

function impactToneClass(impact, styles) {
  if (impact > 0) return styles.impactPositive;
  if (impact < 0) return styles.impactNegative;
  return styles.muted;
}

function reachToneClass(pct, styles) {
  if (pct >= 100) return styles.reachHit;
  if (pct >= 90)  return styles.reachClose;
  if (pct >= 75)  return styles.reachMid;
  return styles.reachLow;
}
