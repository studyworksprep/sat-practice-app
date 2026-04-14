-- =========================================================
-- Update get_visible_students_with_stats to delegate to
-- list_visible_users() instead of inlining the visibility
-- clauses
-- =========================================================
-- Backstory: 20240101000005_create_get_visible_students_with_stats.sql
-- created this function as a targeted workaround for the narrow
-- profiles-table RLS (which doesn't cover the manager → tutor →
-- student transitive path). The original body re-implemented the
-- visibility union clauses inline — which worked but violated
-- §3.8's "one canonical place for hierarchy logic" principle:
-- we ended up with the visibility logic in three places
-- (can_view(), list_visible_users(), and this function).
--
-- This migration updates the function body to call
-- list_visible_users('student') instead of inlining the union.
-- The function is still SECURITY DEFINER — it still bypasses
-- profiles RLS, which is the point of the workaround — but now
-- the visibility logic lives in exactly one place. Any future
-- update to can_view() or list_visible_users() automatically
-- propagates here with no maintenance.
--
-- The eventual Phase 2 step 9 work (rewriting profiles RLS to
-- use can_view() directly) still makes this whole function
-- redundant; this migration just keeps us honest while we wait
-- for that work.
--
-- Only the function body changes. The signature, return shape,
-- security-definer-ness, search_path, and grants are all
-- identical to 20240101000005. No caller changes required —
-- app/next/(tutor)/tutor/dashboard/page.js continues to call
-- the same RPC with the same arguments.
-- =========================================================

create or replace function public.get_visible_students_with_stats()
returns table (
  user_id            uuid,
  email              text,
  first_name         text,
  last_name          text,
  target_sat_score   integer,
  high_school        text,
  graduation_year    integer,
  total_attempts     bigint,
  correct_attempts   bigint,
  week_attempts      bigint,
  last_activity_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_ids as (
    -- Delegate to the §3.8 canonical hierarchy helper. This is
    -- the ONLY place the tutor dashboard page touches the
    -- visibility clauses, so any future update to can_view()
    -- or list_visible_users() propagates here automatically.
    -- list_visible_users already filters by role='student' when
    -- called with the 'student' arg, so no further role filter
    -- is needed below.
    select user_id
    from public.list_visible_users('student')
  ),
  attempts_agg as (
    select
      a.user_id,
      count(*) filter (where a.source = 'practice')                                    as total_attempts,
      count(*) filter (where a.source = 'practice' and a.is_correct)                   as correct_attempts,
      count(*) filter (where a.source = 'practice' and a.created_at >= now() - interval '7 days') as week_attempts,
      max(a.created_at) filter (where a.source = 'practice')                           as last_activity_at
    from public.attempts a
    where a.user_id in (select user_id from visible_ids)
    group by a.user_id
  )
  select
    p.id                                                 as user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.target_sat_score,
    p.high_school,
    p.graduation_year,
    coalesce(agg.total_attempts, 0)                       as total_attempts,
    coalesce(agg.correct_attempts, 0)                     as correct_attempts,
    coalesce(agg.week_attempts, 0)                        as week_attempts,
    agg.last_activity_at
  from visible_ids v
  join public.profiles p on p.id = v.user_id
  left join attempts_agg agg on agg.user_id = p.id
  order by agg.last_activity_at desc nulls last;
$$;

-- Grants unchanged from 20240101000005 (authenticated only).
-- Re-applying them here is idempotent and makes this file
-- self-sufficient for a fresh `supabase db reset`.
revoke all on function public.get_visible_students_with_stats() from public;
revoke all on function public.get_visible_students_with_stats() from anon;
grant execute on function public.get_visible_students_with_stats() to authenticated;
