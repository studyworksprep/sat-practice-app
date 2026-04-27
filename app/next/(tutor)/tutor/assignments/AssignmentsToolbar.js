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
//
// The pure filter / sort / paginate helpers the server page also
// uses live in ./helpers.js — kept out of this file because once
// a module is marked 'use client', every export becomes a client
// reference and the server can no longer invoke them as plain JS
// functions.

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
