// Search the complete visible roster. Pins precede recently opened
// students; alphabetical order fills the remaining shortcuts.

'use client';

import Link from 'next/link';
import { track } from '@vercel/analytics';
import { useMemo, useRef, useState } from 'react';
import { RosterIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { useDashboardHistory } from '@/lib/tutor/DashboardHistory';
import s from './Dashboard.module.css';

const RECENT_TILE_COUNT = 8;

/**
 * @typedef {object} Student
 * @property {string}        id
 * @property {string}        name
 * @property {string|null}   email
 * @property {number|null}   targetScore
 * @property {string|null}   highSchool
 * @property {number|null}   graduationYear
 */

export function RosterFinder({ students }) {
  const { students: orderedStudents, history, togglePin, recordStudent, saved } = useDashboardHistory(students);
  function recordAction(studentId, action) {
    recordStudent?.(studentId);
    track('tutor_dashboard_action', { action });
  }
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef(null);
  const firstTileRef = useRef(null);

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmed) return orderedStudents;
    return orderedStudents.filter((st) => {
      const haystack = [
        st.name,
        st.email,
        st.highSchool,
      ]
        .filter(Boolean)
        .map((v) => v.toLowerCase())
        .join(' · ');
      return haystack.includes(trimmed);
    });
  }, [orderedStudents, trimmed]);

  const tileCount = trimmed ? filtered.length : RECENT_TILE_COUNT;
  const tiles = filtered.slice(0, tileCount);
  const hiddenCount = students.length - RECENT_TILE_COUNT;

  function onSearchChange(e) {
    setQuery(e.target.value);
    if (showAll) setShowAll(false);
  }

  function onSearchKeyDown(e) {
    // Enter on the search input jumps to the first result. Ref-
    // based lookup is robust across CSS Module class hashing.
    if (e.key === 'Enter' && firstTileRef.current) {
      e.preventDefault();
      firstTileRef.current.click();
    }
  }

  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.sectionLabel}>
          <IconTile icon={RosterIcon} palette="navy" size="sm" />
          Find a student
        </div>
        <div className={s.cardHeaderHint}>
          {students.length} on your roster · pinned students first, then recently opened.
        </div>
      </div>

      <div className={s.finderRow}>
        <div className={s.searchWrap}>
          <input
            ref={inputRef}
            type="search"
            placeholder="Search by name, email, or school…"
            value={query}
            onChange={onSearchChange}
            onKeyDown={onSearchKeyDown}
            className={s.searchInput}
            aria-label="Search students"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className={s.searchClear}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {!trimmed && hiddenCount > 0 && (
          <button
            type="button"
            className={s.allBtn}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Hide full roster' : `Show all ${students.length}`}
          </button>
        )}
      </div>

      {trimmed && (
        <div className={s.filterCountLine} aria-live="polite">
          {filtered.length === 0
            ? <span className={s.muted}>No students match.</span>
            : <span className={s.muted}>
                {filtered.length} match{filtered.length === 1 ? '' : 'es'}
              </span>}
        </div>
      )}

      {tiles.length > 0 && (
        <div className={s.tileGrid}>
          {tiles.map((st, i) => (
            <article
              key={st.id}
              className={s.tile}
            >
              <div className={s.tileTop}>
                <div className={s.tileAvatar} aria-hidden="true">
                  {initialsOf(st.name)}
                </div>
                <div className={s.tileMain}>
                  <Link
                    href={`/tutor/students/${st.id}`}
                    className={s.tileName}
                    onClick={() => recordAction(st.id, 'open_student')}
                    ref={i === 0 ? firstTileRef : null}
                  >{st.name}</Link>
                  <div className={s.tileSchool}>
                    {st.highSchool ?? st.email ?? ''}
                  </div>
                </div>
                <button
                  type="button"
                  className={s.pinButton}
                  aria-pressed={history.pinned.includes(st.id)}
                  aria-label={`${history.pinned.includes(st.id) ? 'Unpin' : 'Pin'} ${st.name}`}
                  onClick={() => togglePin(st.id)}
                >{history.pinned.includes(st.id) ? 'Pinned' : 'Pin'}</button>
              </div>
              {(st.targetScore != null || st.graduationYear) && (
                <div className={s.tileMetrics}>
                  {st.targetScore != null && (
                    <span className={s.tileMetric}>
                      Target <strong>{st.targetScore}</strong>
                    </span>
                  )}
                  {st.graduationYear && (
                    <span className={s.tileMetric}>
                      Class of <strong>{st.graduationYear}</strong>
                    </span>
                  )}
                </div>
              )}
              <div className={s.tileActions}>
                <Link href={`/tutor/session/${st.id}`} prefetch={false} onClick={() => recordAction(st.id, 'prepare_session')} aria-label={`Prepare session with ${st.name}`}>Prepare session</Link>
                <Link href={`/tutor/assignments/new?student=${st.id}`} prefetch={false} onClick={() => recordAction(st.id, 'assign_work')} aria-label={`Assign work to ${st.name}`}>Assign work</Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className={s.footnote}>
        {saved === false
          ? 'Browser storage is unavailable. Pins may not be saved after you leave.'
          : 'Pins and recently opened students are saved on this browser. Other students appear alphabetically.'}
      </p>

      {showAll && !trimmed && (
        <div className={s.tableWrap} style={{ marginTop: 'var(--s4)' }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Name</th>
                <th className={s.th}>Email</th>
                <th className={s.thNum}>Target</th>
                <th className={s.th}>School</th>
                <th className={s.thNum}>Class</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.id} className={s.row}>
                  <td className={s.td}>
                    <Link
                      href={`/tutor/students/${st.id}`}
                      className={s.nameLink}
                    >
                      <div className={s.nameMain}>{st.name}</div>
                    </Link>
                  </td>
                  <td className={s.td}>{st.email ?? <span className={s.muted}>—</span>}</td>
                  <td className={s.tdNum}>{st.targetScore ?? '—'}</td>
                  <td className={s.td}>{st.highSchool ?? <span className={s.muted}>—</span>}</td>
                  <td className={s.tdNum}>{st.graduationYear ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}
