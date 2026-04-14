-- =========================================================
-- get_visible_students_with_stats — hierarchy-aware RPC for
-- the tutor dashboard
-- =========================================================
-- Backstory: the tutor dashboard page at
-- app/next/(tutor)/tutor/dashboard/page.js was built to call
-- list_visible_users('student') to get the visible student set,
-- then do a second profiles query with `.in('id', studentIds)` to
-- get display details. That pattern worked for tutors (who get
-- students via teacher_can_view_student()) but broke for managers
-- looking at their tutors' students via the transitive
-- manager → tutor → student chain: list_visible_users correctly
-- returned those student ids, but the subsequent profiles query
-- was filtered by the `profiles` table RLS, which only allows the
-- direct teacher_can_view_student() path — the transitive manager
-- visibility wasn't wired into profiles RLS. Result: the
-- transitive students silently disappeared from the dashboard.
--
-- The proper long-term fix is to rewrite the profiles SELECT
-- policy to use can_view() from §3.8 instead of the narrower
-- teacher_can_view_student() helper. That work is part of
-- Phase 2 step 9 ("Fix the RLS drift using can_view()") and
-- touches policies across many tables, not just profiles.
-- Doing it as a one-off patch carries too much blast risk.
--
-- This RPC is a targeted workaround that avoids profiles RLS
-- entirely by doing the profile join and attempts aggregation
-- inside a SECURITY DEFINER function. The function owner
-- (postgres / supabase_admin) can see every row, and the
-- function's visibility clauses re-implement the exact same
-- union from list_visible_users() to enforce access control.
--
-- Phase 2 step 9 eventually makes this RPC redundant. When
-- profiles RLS uses can_view(user_id), the tutor dashboard can
-- go back to the simpler three-query pattern, and this RPC can
-- be dropped in Phase 6 decommission.
--
-- Returns one row per visible student with the aggregate stats
-- the dashboard needs. Ordered by last_activity_at descending,
-- students with no activity last.

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
    -- Self
    select id as uid from public.profiles where id = auth.uid()

    union

    -- Admin sees everyone
    select id as uid from public.profiles where public.is_admin()

    union

    -- Direct tutor → student
    select tsa.student_id
    from public.teacher_student_assignments tsa
    where tsa.teacher_id = auth.uid()

    union

    -- Transitive manager → tutor → student. THIS IS THE BRANCH
    -- that the original page's profiles-table query was silently
    -- dropping — the whole point of this RPC.
    select tsa.student_id
    from public.manager_teacher_assignments mta
    join public.teacher_student_assignments tsa using (teacher_id)
    where mta.manager_id = auth.uid()

    union

    -- Class-based legacy path
    select ce.student_id
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where c.teacher_id = auth.uid()
  ),
  attempts_agg as (
    select
      a.user_id,
      count(*) filter (where a.source = 'practice')                                    as total_attempts,
      count(*) filter (where a.source = 'practice' and a.is_correct)                   as correct_attempts,
      count(*) filter (where a.source = 'practice' and a.created_at >= now() - interval '7 days') as week_attempts,
      max(a.created_at) filter (where a.source = 'practice')                           as last_activity_at
    from public.attempts a
    where a.user_id in (select uid from visible_ids)
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
  join public.profiles p on p.id = v.uid
  left join attempts_agg agg on agg.user_id = p.id
  where p.role = 'student'
  order by agg.last_activity_at desc nulls last;
$$;

comment on function public.get_visible_students_with_stats() is
  'Returns every student the caller can see (via the §3.8 unified hierarchy rules) plus basic practice stats. SECURITY DEFINER so it bypasses the narrower profiles RLS that only covers direct teacher_can_view_student() paths. Phase 2 step 9 rewrites profiles RLS to use can_view(), at which point this RPC becomes redundant and gets dropped in Phase 6. See docs/architecture-plan.md §3.8.';

revoke all on function public.get_visible_students_with_stats() from public;
revoke all on function public.get_visible_students_with_stats() from anon;
grant execute on function public.get_visible_students_with_stats() to authenticated;
