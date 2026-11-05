'use client';

// Header student finder: type a name, email or school; matches drop
// down under the field. Arrow keys move through results, Enter opens
// the first, Escape clears. Pinned and recently opened students sort
// first (DashboardHistory).

import Link from 'next/link';
import { track } from '@vercel/analytics';
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useDashboardHistory } from '@/lib/tutor/DashboardHistory';
import s from './Dashboard.module.css';

type Student = { id: string; name: string; email: string | null; highSchool: string | null };

export function RosterFinder({ students }: { students: Student[] }) {
  const { students: ordered, recordStudent } = useDashboardHistory(students);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const links = useRef<Array<HTMLAnchorElement | null>>([]);
  const term = query.trim().toLocaleLowerCase();
  const matches = term ? ordered.filter((student) =>
    [student.name, student.email, student.highSchool].some((value) => value?.toLocaleLowerCase().includes(term)),
  ) : [];
  const visible = matches.slice(0, 8);

  function onKey(event: KeyboardEvent, index = -1) {
    if (event.key === 'Escape') {
      event.preventDefault(); setQuery(''); input.current?.focus();
    } else if (event.key === 'ArrowDown' && visible.length) {
      event.preventDefault(); links.current[Math.min(index + 1, visible.length - 1)]?.focus();
    } else if (event.key === 'ArrowUp' && index >= 0) {
      event.preventDefault();
      if (index === 0) input.current?.focus();
      else links.current[index - 1]?.focus();
    } else if (event.key === 'Enter' && index === -1 && visible.length) {
      event.preventDefault(); links.current[0]?.click();
    }
  }

  return (
    <div className={s.finder} role="search">
      <label className={s.srOnly} htmlFor="student-search">Find a student</label>
      <input
        ref={input}
        id="student-search"
        type="search"
        autoComplete="off"
        placeholder="Find a student…"
        aria-controls={term ? 'student-search-results' : undefined}
        className={s.searchInput}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => onKey(event)}
      />
      {query && (
        <button type="button" className={s.searchClear} aria-label="Clear search"
          onClick={() => { setQuery(''); input.current?.focus(); }}>×</button>
      )}
      <div role="status" className={s.srOnly}>
        {term && (matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}` : 'No students match')}
      </div>
      {term && (
        <div className={s.finderPopover}>
          {visible.length === 0 ? (
            <p className={s.finderEmpty}>No students match. Try another name, email, or school.</p>
          ) : (
            <ul id="student-search-results" className={s.searchResults} aria-label="Matching students">
              {visible.map((student, index) => (
                <li key={student.id}>
                  <Link
                    href={`/tutor/students/${student.id}`}
                    prefetch={false}
                    ref={(element) => { links.current[index] = element; }}
                    className={s.searchResult}
                    onKeyDown={(event) => onKey(event, index)}
                    onClick={() => { recordStudent?.(student.id); track('tutor_dashboard_action', { action: 'open_student' }); }}
                  >
                    <span>
                      <strong>{student.name}</strong>
                      <span className={s.searchDetail}>{student.highSchool ?? student.email}</span>
                    </span>
                    <span aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {matches.length > 8 && <p className={s.finderEmpty}>Showing the first 8. Keep typing to narrow it.</p>}
        </div>
      )}
    </div>
  );
}
