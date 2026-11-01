'use client';

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
  const matches = term ? ordered.filter(student =>
    [student.name, student.email, student.highSchool].some(value => value?.toLocaleLowerCase().includes(term)),
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

  return <section className={s.card} aria-label="Find a student">
    <div className={s.cardHeader}>
      <label className={s.sectionLabel} htmlFor="student-search">Find a student</label>
      <Link href="/tutor/roster" className={s.reviewAction}>Full roster →</Link>
    </div>
    <div className={s.searchWrap}>
      <input ref={input} id="student-search" type="search" autoComplete="off"
        placeholder="Search by name, email, or school…" aria-label="Search students"
        aria-controls={term ? 'student-search-results' : undefined}
        className={s.searchInput} value={query}
        onChange={event => setQuery(event.target.value)} onKeyDown={event => onKey(event)} />
      {query && <button type="button" className={s.searchClear} aria-label="Clear search"
        onClick={() => { setQuery(''); input.current?.focus(); }}>×</button>}
    </div>
    <div role="status" className={term ? s.searchStatus : undefined}>
      {term && (matches.length ? `${matches.length} match${matches.length === 1 ? '' : 'es'}${matches.length > 8 ? ' · Showing the first 8; keep typing to narrow your search.' : ''}` : 'No students match. Try another name, email, or school.')}
    </div>
    {term && <ul id="student-search-results" className={s.searchResults} aria-label="Matching students">
      {visible.map((student, index) => <li key={student.id}>
        <Link href={`/tutor/students/${student.id}`} prefetch={false}
          ref={element => { links.current[index] = element; }}
          className={s.searchResult} onKeyDown={event => onKey(event, index)}
          onClick={() => { recordStudent?.(student.id); track('tutor_dashboard_action', { action: 'open_student' }); }}>
          <span><strong>{student.name}</strong><span className={s.searchDetail}>{student.highSchool ?? student.email}</span></span>
          <span aria-hidden="true">→</span>
        </Link>
      </li>)}
    </ul>}
  </section>;
}
