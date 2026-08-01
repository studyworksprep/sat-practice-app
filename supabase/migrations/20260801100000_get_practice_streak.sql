-- =========================================================
-- get_practice_streak — daily practice streak (§6.1 footer strip)
-- =========================================================
-- One aggregate round trip for the sidebar's countdown/streak
-- strip: consecutive UTC days with at least one attempt, ending
-- today or yesterday (a streak isn't broken until a full day is
-- missed). Day convention matches build-session-review's daily
-- map and the Lessonworks sync (UTC dates); the walk algorithm
-- is the gaps-and-islands form of lessonworksSync's JS loop —
-- ordered desc, age(=days ago) minus row_number is constant
-- exactly along the top island of consecutive days.
--
-- SECURITY INVOKER: attempts RLS scopes it, so a student reads
-- their own streak and a tutor could read a student's (can_view).
-- 400-day scan window bounds the work; nobody's streak survives
-- a year-long gap anyway.

create or replace function public.get_practice_streak(p_user uuid)
returns table (current_streak integer, practiced_today boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with days as (
    select distinct (a.created_at at time zone 'utc')::date as d
    from attempts a
    where a.user_id = p_user
      and a.created_at >= now() - interval '400 days'
  ),
  walk as (
    select ((now() at time zone 'utc')::date - d) as age,
           row_number() over (order by d desc) - 1 as rn
    from days
  ),
  anchor as (
    select min(age) as start_age from walk where age <= 1
  )
  select
    coalesce(
      (select count(*)::integer
       from walk, anchor
       where anchor.start_age is not null
         and walk.age - walk.rn = anchor.start_age),
      0
    ) as current_streak,
    exists (select 1 from walk where age = 0) as practiced_today
$$;

comment on function public.get_practice_streak(uuid) is
  'Consecutive UTC practice days ending today or yesterday, plus '
  'whether the user practiced today (§6.1 sidebar strip). '
  'SECURITY INVOKER — attempts RLS scopes visibility.';

grant execute on function public.get_practice_streak(uuid) to authenticated;
