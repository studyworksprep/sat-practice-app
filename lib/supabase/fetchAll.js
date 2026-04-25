// Paginated Supabase fetch helper.
//
// Background (architecture plan Finding #1): PostgREST silently caps
// any SELECT at the `max-rows` value (typically 1000 or whatever the
// Supabase project is configured to), which means a raw
// `.select(...).limit(5000)` looks safe but actually truncates at
// 1000 on some envs. A `.from(...).select(...)` without a limit at
// all still caps at `max-rows`. The only way to guarantee the full
// set is to page through explicit `.range(from, to)` windows until
// the DB hands back a short page.
//
// Usage:
//
//   const rows = await fetchAll((from, to) =>
//     supabase
//       .from('questions_v2')
//       .select('id, domain_name, skill_name, score_band')
//       .eq('is_published', true)
//       .eq('is_broken', false)
//       .is('deleted_at', null)
//       .range(from, to),
//   );
//
// The callback receives inclusive [from, to] indices and must return
// a Supabase `{ data, error }` shape. fetchAll loops with a page
// size of 1000 by default (tune via the 2nd arg), stops when a page
// is short (< pageSize), and rethrows the first error.
//
// 50k hard cap keeps this from running away on pathological inputs.

const DEFAULT_PAGE = 1000;
const HARD_CAP = 50_000;

/**
 * @template T
 * @param {(from: number, to: number) => Promise<{data: T[] | null, error: any}>} queryFn
 * @param {{ pageSize?: number, hardCap?: number }} [options]
 * @returns {Promise<T[]>}
 */
export async function fetchAll(queryFn, options = {}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE;
  const cap = options.hardCap ?? HARD_CAP;
  const rows = [];
  let from = 0;
  while (from < cap) {
    const to = from + pageSize - 1;
    const { data, error } = await queryFn(from, to);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
