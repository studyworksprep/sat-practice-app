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

// Window size for `fetchAll`. Matches PostgREST's default max_rows, so
// a correctly-sized server fills each window exactly; a server capped
// lower simply returns short windows, which `fetchAll` handles.
export const FETCH_ALL_PAGE_SIZE = 1000;
// Backstop so a runaway table surfaces as an error rather than an
// unbounded read that exhausts memory.
export const MAX_FETCH_ALL_ROWS = 100_000;

// Structural view of a PostgREST query builder — just the pieces this
// helper touches. Keeps the helper decoupled from postgrest-js's deep
// generic signatures while still flowing the row type through to
// `items`.
interface PageQuery<T> extends PromiseLike<{
  data: T[] | null;
  error: unknown;
  count: number | null;
}> {
  order(column: string, opts: { ascending: boolean }): PageQuery<T>;
  range(from: number, to: number): PageQuery<T>;
}

export interface PaginateOptions {
  page?: number | string;
  pageSize?: number | string;
  order?: { column: string; ascending?: boolean };
}

export interface OrderSpec {
  column: string;
  ascending?: boolean;
}

export interface FetchAllOptions {
  // Deterministic sort key. Must be unique across rows — pass the full
  // composite key when no single column is unique, otherwise equal keys
  // can land in a different order on each request and windows will skip
  // and repeat rows.
  order: OrderSpec | OrderSpec[];
  pageSize?: number;
  maxRows?: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
  hasMore: boolean;
}

function clampPage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw: unknown): number {
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
 */
export async function paginate<T>(
  query: PageQuery<T>,
  opts: PaginateOptions = {},
): Promise<Page<T>> {
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
 * Read *every* row matching a query, in deterministic order, without
 * tripping PostgREST's row cap.
 *
 * `paginate` serves one page of a list UI; this serves the other need —
 * a whole-table read the caller then aggregates (per-lesson block
 * counts, per-lesson efficacy rollups). A bare `.select()` looks like it
 * already does this, but it silently stops at db-max-rows, and because
 * that truncation is unordered it drops whole groups off the tail
 * instead of trimming every group evenly. An aggregate built on the
 * short read then reports a confident zero rather than an error.
 *
 * `buildQuery` must return a *fresh* builder on each call: postgrest-js
 * builders are single-use, so a window cannot be re-ranged after it has
 * been awaited.
 *
 * Windows are requested at `pageSize` but advanced by the number of rows
 * actually returned, so a server configured with a lower max_rows just
 * yields smaller windows instead of a short read.
 */
export async function fetchAll<T>(
  buildQuery: () => PageQuery<T>,
  opts: FetchAllOptions,
): Promise<T[]> {
  const order = Array.isArray(opts.order) ? opts.order : [opts.order];
  if (order.length === 0) {
    throw new Error('fetchAll requires at least one order column');
  }
  const pageSize = clampFetchAllPageSize(opts.pageSize);
  const maxRows = opts.maxRows ?? MAX_FETCH_ALL_ROWS;

  const rows: T[] = [];
  let from = 0;
  for (;;) {
    let query = buildQuery();
    for (const spec of order) {
      query = query.order(spec.column, { ascending: spec.ascending ?? true });
    }
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;

    const batch = data ?? [];
    if (batch.length === 0) break;
    // Appended one at a time rather than spread: a window wide enough
    // to blow the argument limit would throw on `push(...batch)`.
    for (const row of batch) rows.push(row);
    from += batch.length;

    if (rows.length > maxRows) {
      throw new Error(
        `fetchAll exceeded maxRows (${maxRows}); narrow the query or raise the limit`,
      );
    }
  }
  return rows;
}

function clampFetchAllPageSize(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return FETCH_ALL_PAGE_SIZE;
  return Math.floor(n);
}

/**
 * Count rows matching a query without fetching them. Uses the PostgREST
 * HEAD trick: `{ head: true, count: 'exact' }` returns just the count.
 */
export async function countExact(query: {
  select(
    columns: string,
    opts: { count: 'exact'; head: boolean },
  ): PromiseLike<{ count: number | null; error: unknown }>;
}): Promise<number> {
  const { count, error } = await query.select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}
