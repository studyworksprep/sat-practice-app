-- =========================================================
-- get_practice_volume_by_week — 8-week activity aggregate
-- for the admin landing page
-- =========================================================
-- Returns one row per ISO week covering the last N weeks
-- (default 8). Each row has the total practice attempts and
-- total practice-test attempts in that week. Used by the
-- admin landing page to render the Practice Volume chart —
-- the same chart the legacy AdminDashboard had, but without
-- the db-max-rows silent-truncation bug that bit the legacy
-- /api/admin/platform-stats route.
--
-- Why this is an RPC rather than a plain query:
--   - The bucketing (date_trunc to week) is easier in SQL
--     than in JS, especially when we want empty weeks to
--     appear as zero rather than being missing from the
--     result entirely.
--   - The function can do the aggregation server-side in
--     one pass, returning ~8 rows instead of 8*N attempts
--     rows that would have to be aggregated client-side.
--   - SECURITY DEFINER so it can read across all users'
--     attempts without going through per-row RLS.
--
-- The function generates a calendar series with generate_series
-- so that weeks with zero activity still appear in the result,
-- ordered chronologically. Without this, the chart would silently
-- drop blank weeks and the x-axis would jump, hiding gaps.

create or replace function public.get_practice_volume_by_week(weeks integer default 8)
returns table (
  week_start     timestamptz,
  practice_count bigint,
  test_count     bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with week_series as (
    -- Generate exactly `weeks` consecutive weeks ending with the
    -- current week. date_trunc('week', ...) returns Monday UTC.
    select generate_series(
      date_trunc('week', now()) - make_interval(weeks => weeks - 1),
      date_trunc('week', now()),
      '1 week'::interval
    ) as wk
  ),
  practice_agg as (
    select
      date_trunc('week', created_at) as wk,
      count(*)::bigint as n
    from public.attempts
    where source = 'practice'
      and created_at >= date_trunc('week', now()) - make_interval(weeks => weeks - 1)
    group by 1
  ),
  test_agg as (
    select
      date_trunc('week', started_at) as wk,
      count(*)::bigint as n
    from public.practice_test_attempts
    where status = 'completed'
      and started_at >= date_trunc('week', now()) - make_interval(weeks => weeks - 1)
    group by 1
  )
  select
    ws.wk                                    as week_start,
    coalesce(pa.n, 0)                        as practice_count,
    coalesce(ta.n, 0)                        as test_count
  from week_series ws
  left join practice_agg pa on pa.wk = ws.wk
  left join test_agg ta on ta.wk = ws.wk
  order by ws.wk asc;
$$;

comment on function public.get_practice_volume_by_week(integer) is
  'Returns one row per ISO week for the last N weeks with practice-attempt and practice-test counts. Empty weeks appear as zero. Used by the admin landing page Practice Volume chart. Security-definer so it aggregates across all users.';

revoke all on function public.get_practice_volume_by_week(integer) from public;
revoke all on function public.get_practice_volume_by_week(integer) from anon;
grant execute on function public.get_practice_volume_by_week(integer) to authenticated;
