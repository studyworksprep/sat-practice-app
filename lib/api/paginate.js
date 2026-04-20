// Shared pagination helper for Supabase list queries.
// See docs/architecture-plan.md §3.3.
//
// Motivation: the db-max-rows silent-truncation bug was caused by
// `.limit(50000)` calls on unordered queries. PostgREST caps at
// 1000 rows unless `max_rows` is raised; without an .order() the
// silently-truncated result is nondeterministic.
//
// This helper enforces:
//   - A page size with a hard maximum (MAX_PAGE_SIZE)
//   - A mandatory .order() on a deterministic column
//   - Returns { items, page, pageSize, total, hasMore } so the caller
//     never guesses whether there are more rows
//
// Usage:
//
//   import { paginate } from '@/lib/api/paginate';
//   const { items, total, hasMore } = await paginate(
//     supabase.from('attempts').select('*', { count: 'exact' }),
//     { page: 1, pageSize: 25, order: { column: 'created_at', ascending: false } }
//   );

export const MAX_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE = 25;

function clampPage(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

/**
 * Apply page/pageSize/order to a Supabase query builder and return the
 * standard shape `{ items, page, pageSize, total, hasMore }`.
 *
 * The query must have been built with `.select('*', { count: 'exact' })`
 * (or similar) for `total` to be populated. If the caller didn't request
 * a count, `total` will be `null` and `hasMore` falls back to a length
 * heuristic.
 *
 * @param {object} query - A Supabase PostgrestFilterBuilder
 * @param {object} opts
 * @param {number|string} [opts.page=1]
 * @param {number|string} [opts.pageSize=25]
 * @param {object} [opts.order] - { column: string, ascending?: boolean }
 * @returns {Promise<{items: any[], page: number, pageSize: number, total: number|null, hasMore: boolean}>}
 */
export async function paginate(query, opts = {}) {
  const page = clampPage(opts.page ?? 1);
  const pageSize = clampPageSize(opts.pageSize ?? DEFAULT_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const order = opts.order ?? { column: 'created_at', ascending: false };
  let q = query.order(order.column, { ascending: order.ascending ?? false });
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;

  const items = data ?? [];
  const total = typeof count === 'number' ? count : null;
  const hasMore =
    total !== null ? from + items.length < total : items.length === pageSize;

  return { items, page, pageSize, total, hasMore };
}

/**
 * Count rows matching a query without fetching them. Uses the PostgREST
 * HEAD trick: `{ head: true, count: 'exact' }` returns just the count.
 *
 * @param {object} query - A Supabase PostgrestFilterBuilder
 * @returns {Promise<number>}
 */
export async function countExact(query) {
  const { count, error } = await query.select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}
