-- Stage E follow-up: the v1 practice_test attempt-family tables have
-- zero readers and zero writers in application code after Stage E-1
-- through E-3 (PR commits dd147f9..83ed2ab). Move them to the
-- _legacy schema so PostgREST stops exposing them and any forgotten
-- caller fails loudly instead of returning stale rows.
--
-- The data is preserved (SET SCHEMA, not DROP) — 145 attempts, 374
-- module attempts, 8,402 item attempts. Of those, 59 attempts (and
-- their children) are v1-only and were never mirrored to v2 — they
-- become invisible end-to-end. The 26 *completed* v1-only attempts
-- were explicitly written off in the Stage E planning conversation.
--
-- The intra-cluster FKs (item_attempts → module_attempts → attempts)
-- continue to work cross-schema after the move; Postgres has no
-- problem with cross-schema FK references.

-- 1. Repoint the only DB function that still reads the v1 table.
--    get_practice_volume_by_week is called from admin/page.js to
--    render the 8-week practice volume chart. Its 'test_agg' CTE
--    counted completed v1 attempts; bumping to _v2 keeps the chart
--    accurate (and includes the 33 v2-native attempts the v1 query
--    was missing).
create or replace function public.get_practice_volume_by_week(weeks integer default 8)
returns table(week_start timestamp with time zone, practice_count bigint, test_count bigint)
language plpgsql
stable
security definer
set search_path = 'public'
as $$
begin
  if not public.is_admin() then
    return;
  end if;

  return query
  with week_series as (
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
    from public.practice_test_attempts_v2
    where status = 'completed'
      and started_at >= date_trunc('week', now()) - make_interval(weeks => weeks - 1)
    group by 1
  )
  select
    ws.wk                     as week_start,
    coalesce(pa.n, 0)         as practice_count,
    coalesce(ta.n, 0)         as test_count
  from week_series ws
  left join practice_agg pa on pa.wk = ws.wk
  left join test_agg ta on ta.wk = ws.wk
  order by ws.wk asc;
end;
$$;

-- 2. Archive the three tables. Order is bottom-up just to make the
--    move read naturally; cross-schema FKs would tolerate any order.
alter table public.practice_test_item_attempts   set schema _legacy;
alter table public.practice_test_module_attempts set schema _legacy;
alter table public.practice_test_attempts        set schema _legacy;

-- 3. Drop the schema cache so PostgREST stops exposing the tables.
notify pgrst, 'reload schema';
