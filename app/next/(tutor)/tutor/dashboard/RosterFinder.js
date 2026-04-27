// Tutor roster finder. Replaces the dashboard's flat student
// table with a search-first picker that scales past a roster of
// 38+ without forcing the tutor to scroll.
//
// Default view: an input on top, plus a compact tile grid of the
// 8 most-recently-active students. That's 1 click to land on the
// student you saw most recently — which is what tutors usually
// reach for between sessions.
//
// Typing in the search filters the WHOLE roster live (case-
// insensitive on name + email + school). Result tiles render in
// the same compact form. The first match is keyboard-focusable
// and Enter activates it, so it's "type two letters, hit Enter"
// for fast finds.
//
// "Show all" toggles a denser fallback table for the rare case
// the tutor wants to scan everyone — same columns the prior
// dashboard had.

'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { formatRelativeShort } from '@/lib/formatters';
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
 * @property {number}        totalAttempts
 * @property {number}        weekAttempts
 * @property {number|null}   accuracy
 * @property {string|null}   lastActivityAt
 */

export function RosterFinder({ students }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef(null);
  const firstTileRef = useRef(null);

  const trimmed = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmed) return students;
    return students.filter((st) => {
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
  }, [students, trimmed]);

  // Default tiles: 8 most-recently-active students. The full
  // roster query already orders by last_activity_at desc, so the
  // first N entries are exactly that. When a query is active we
  // expand to the full filtered list.
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
        <div className={s.sectionLabel}>Find a student</div>
        <div className={s.cardHeaderHint}>
          {students.length} on your roster · click a tile or type a
          name to jump to one.
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
            <Link
              key={st.id}
              href={`/tutor/students/${st.id}`}
              className={s.tile}
              ref={i === 0 ? firstTileRef : null}
            >
              <div className={s.tileTop}>
                <div className={s.tileAvatar} aria-hidden="true">
                  {initialsOf(st.name)}
                </div>
                <div className={s.tileMain}>
                  <div className={s.tileName}>{st.name}</div>
                  <div className={s.tileSchool}>
                    {st.highSchool ?? st.email ?? ''}
                  </div>
                </div>
              </div>
              <div className={s.tileMetrics}>
                <span className={s.tileMetric}>
                  <strong>{st.accuracy == null ? '—' : `${st.accuracy}%`}</strong>{' '}
                  acc
                </span>
                <span className={s.tileMetric}>
                  <strong>{st.weekAttempts}</strong> this week
                </span>
                <span className={s.tileLast}>
                  {formatRelativeShort(st.lastActivityAt) ?? '—'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showAll && !trimmed && (
        <div className={s.tableWrap} style={{ marginTop: 'var(--s4)' }}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>Name</th>
                <th className={s.thNum}>Target</th>
                <th className={s.thNum}>Attempts</th>
                <th className={s.thNum}>Accuracy</th>
                <th className={s.thNum}>7-day</th>
                <th className={s.th}>Last activity</th>
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
                    {(st.highSchool || st.graduationYear) && (
                      <div className={s.nameSub}>
                        {st.highSchool}
                        {st.graduationYear ? ` · class of ${st.graduationYear}` : ''}
                      </div>
                    )}
                  </td>
                  <td className={s.tdNum}>{st.targetScore ?? '—'}</td>
                  <td className={s.tdNum}>{st.totalAttempts.toLocaleString()}</td>
                  <td className={s.tdNum}>
                    {st.accuracy == null
                      ? <span className={s.muted}>—</span>
                      : <span className={`${s.accBadge} ${accBadgeTone(st.accuracy, s)}`}>{st.accuracy}%</span>}
                  </td>
                  <td className={s.tdNum}>{st.weekAttempts}</td>
                  <td className={s.td}>
                    {formatRelativeShort(st.lastActivityAt) ?? <span className={s.muted}>—</span>}
                  </td>
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

function accBadgeTone(pct, styles) {
  if (pct >= 80) return styles.accGood;
  if (pct >= 50) return styles.accOk;
  return styles.accBad;
}
