// Pure helpers shared between the assignments page (Server
// Component) and the AssignmentsToolbar (Client Island). They
// live in their own module — without 'use client' — because a
// 'use client' module can't be called from the server. Once a
// file is marked 'use client', every export becomes a client
// reference, including pure functions; the server can render
// the client component but it can't invoke
// `filterAndSort(...)` directly. So: pure logic here, JSX
// island next door, both consume from this file.

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
