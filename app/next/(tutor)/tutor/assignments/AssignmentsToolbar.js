// Tutor → Assignments toolbar. Search + sort + pagination
// drive the page via URL search params, so the page stays
// server-rendered and the URL is shareable / bookmarkable. The
// island handles three concerns:
//   1. Debounced search input — pushes ?q=… on type, 250ms idle.
//   2. Sort dropdown — pushes ?sort=… on change.
//   3. Paginator — Prev / page / Next pushes ?page=…, scrolling
//      the section into view so the user lands on the new rows
//      rather than at the top of the page.
//
// One toolbar component, two instances per page (active +
// archived) — each instance is parameterized by the prefix it
// should write under (e.g., 'q' / 'sort' / 'page' for active,
// 'aq' / 'asort' / 'apage' for archived) so the two states don't
// collide in the URL.

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import s from './AssignmentsToolbar.module.css';

const SORT_OPTIONS = [
  { value: 'newest',         label: 'Newest first' },
  { value: 'oldest',         label: 'Oldest first' },
  { value: 'due-soonest',    label: 'Due soonest' },
  { value: 'due-latest',     label: 'Due latest' },
  { value: 'least-progress', label: 'Least progress' },
  { value: 'most-progress',  label: 'Most progress' },
  { value: 'title',          label: 'Title (A–Z)' },
];

export function AssignmentsToolbar({
  qKey,
  sortKey,
  pageKey,
  initialQ,
  initialSort,
  page,
  totalPages,
  totalCount,
  visibleCount,
  anchorId,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Local state keeps the input snappy; debounce pushes to the URL.
  const [q, setQ] = useState(initialQ ?? '');
  const debounceRef = useRef(null);

  // Sync local state if the URL changes externally (back/forward).
  // The setState-in-effect pattern is intentional here — initialQ
  // is a prop derived from search params, and when the user hits
  // back/forward we want the input to reflect the new URL value.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setQ(initialQ ?? ''); }, [initialQ]);

  // Build a query string with one key changed and `pageKey` reset
  // to 1 (any filter change invalidates the current page index).
  function pushParams(updates, { resetPage = true } = {}) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage) next.delete(pageKey);
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onQChange(e) {
    const value = e.target.value;
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ [qKey]: value });
    }, 250);
  }

  function onSortChange(e) {
    pushParams({ [sortKey]: e.target.value });
  }

  function goToPage(target) {
    if (target < 1 || target > totalPages) return;
    pushParams({ [pageKey]: target === 1 ? null : target }, { resetPage: false });
    // Scroll the section's anchor into view so the user lands on
    // the new rows rather than at the top of the page.
    if (anchorId && typeof document !== 'undefined') {
      const el = document.getElementById(anchorId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  const showPager = totalPages > 1;
  const startIdx = totalCount === 0 ? 0 : (page - 1) * Math.ceil(totalCount / totalPages) + 1;
  const endIdx = Math.min(page * Math.ceil(totalCount / totalPages), totalCount);

  return (
    <div className={s.toolbar}>
      <div className={s.controlsRow}>
        <label className={s.searchLabel}>
          <span className={s.srOnly}>Search assignments</span>
          <input
            type="search"
            value={q}
            onChange={onQChange}
            placeholder="Search title, description, or student…"
            className={s.search}
            autoComplete="off"
          />
        </label>

        <label className={s.sortLabel}>
          <span className={s.srOnly}>Sort by</span>
          <select
            value={initialSort ?? 'newest'}
            onChange={onSortChange}
            className={s.sortSelect}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>

      {showPager && (
        <div className={s.pagerRow}>
          <span className={s.pagerInfo}>
            Showing {visibleCount === 0 ? 0 : `${startIdx}–${endIdx}`} of {totalCount}
          </span>
          <div className={s.pagerButtons}>
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className={s.pagerBtn}
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <span className={s.pagerPage}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className={s.pagerBtn}
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Pure helpers exported so the page (Server Component) can run
// the same filter / sort / page math against its enriched list
// before passing the visible slice down. Centralizing them here
// keeps the toolbar's accounting (visibleCount / totalCount /
// pager visibility) in lockstep with what the page actually
// renders.

export const PAGE_SIZE = 12;

export function filterAndSort(rows, { q, sort, nowMs }) {
  const needle = (q ?? '').trim().toLowerCase();
  let filtered = rows;
  if (needle) {
    filtered = rows.filter((r) => matchesSearch(r, needle));
  }
  return [...filtered].sort(comparatorFor(sort ?? 'newest', nowMs));
}

export function paginate(rows, page) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    items: rows.slice(start, start + PAGE_SIZE),
    page: safePage,
    totalPages,
    totalCount: total,
  };
}

function matchesSearch(row, needle) {
  const fields = [
    row.title,
    row.description,
    row.lesson?.title,
    row.practice_test?.name,
    row.single?.name,
  ];
  for (const f of fields) {
    if (typeof f === 'string' && f.toLowerCase().includes(needle)) return true;
  }
  return false;
}

function comparatorFor(sort, nowMs) {
  switch (sort) {
    case 'oldest':
      return (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at);
    case 'due-soonest':
      return (a, b) => dueRank(a, nowMs, true) - dueRank(b, nowMs, true);
    case 'due-latest':
      return (a, b) => dueRank(b, nowMs, false) - dueRank(a, nowMs, false);
    case 'least-progress':
      return (a, b) => progressPct(a) - progressPct(b);
    case 'most-progress':
      return (a, b) => progressPct(b) - progressPct(a);
    case 'title':
      return (a, b) => (a.title ?? '').localeCompare(b.title ?? '');
    case 'newest':
    default:
      return (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at);
  }
}

function dueRank(row, nowMs, ascending) {
  // Null due dates sort to the end regardless of direction so
  // they don't dominate the head of the list.
  if (!row.due_date) return ascending ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return Date.parse(row.due_date);
}

function progressPct(row) {
  if (!row.studentCount) return 0;
  return row.completedCount / row.studentCount;
}
