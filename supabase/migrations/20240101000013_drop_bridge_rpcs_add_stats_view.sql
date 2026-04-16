-- Phase 2 step 9 cleanup: drop the bridge RPCs that existed purely
-- to work around narrow RLS, and replace their aggregation logic
-- with a security_invoker view that lets RLS do the visibility
-- filtering naturally.
--
-- The three RPCs were created in migrations 000005–000009. They are
-- now redundant because the Type A migration (000012) rewired every
-- visibility SELECT policy to use can_view() directly.
--
-- get_practice_volume_by_week is NOT a bridge RPC — it's a platform-
-- wide admin aggregate — so it's kept, but an is_admin() guard is
-- added since it currently accepts calls from any authenticated user.

-- ============================================================
-- 1. Create student_practice_stats view
--    Replaces the aggregation logic from the bridge RPCs.
--    security_invoker = true means RLS on profiles + attempts is
--    applied as the calling user, so visibility is automatic.
-- ============================================================
create or replace view public.student_practice_stats
  with (security_invoker = true)
as
select
  p.id                                                                         as user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.target_sat_score,
  p.high_school,
  p.graduation_year,
  p.sat_test_date,
  count(a.id) filter (where a.source = 'practice')                            as total_attempts,
  count(a.id) filter (where a.source = 'practice' and a.is_correct)            as correct_attempts,
  count(a.id) filter (where a.source = 'practice'
                        and a.created_at >= now() - interval '7 days')         as week_attempts,
  max(a.created_at) filter (where a.source = 'practice')                       as last_activity_at
from public.profiles p
left join public.attempts a on a.user_id = p.id
where p.role = 'student'
group by p.id;

-- Grant access so PostgREST exposes the view.
grant select on public.student_practice_stats to authenticated;

-- ============================================================
-- 2. Drop bridge RPCs
-- ============================================================
drop function if exists public.get_visible_students_with_stats();
drop function if exists public.get_visible_student_by_id(uuid);
drop function if exists public.get_visible_student_attempts(uuid, integer);

-- ============================================================
-- 3. Secure get_practice_volume_by_week
--    Add is_admin() guard. The function is only called from the
--    admin landing page; non-admins should not see platform-wide
--    practice volume. Non-admins get an empty result set.
-- ============================================================
create or replace function public.get_practice_volume_by_week(weeks integer default 8)
returns table (
  week_start timestamptz,
  practice_count bigint,
  test_count bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    return;  -- empty result set for non-admins
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
    from public.practice_test_attempts
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
