-- =========================================================
-- get_visible_student_by_id — one-student detail for the
-- tutor/manager student detail page
-- =========================================================
-- Companion to 20240101000006_update_get_visible_students_with_stats_to_delegate.
-- That function returns every visible student as a list; this one
-- returns a single student by id, gated on can_view(target) so the
-- caller can't look up a student they aren't allowed to see.
--
-- Used by app/next/(tutor)/tutor/students/[studentId]/page.js to
-- render the student detail view. Follows the same §3.8-respecting
-- delegation pattern as the list RPC: the visibility logic lives
-- in can_view(), not inlined here.
--
-- SECURITY DEFINER because the profiles-table RLS on this database
-- doesn't yet cover the transitive manager → tutor → student path.
-- Phase 2 step 9 rewrites profiles RLS to use can_view() directly,
-- at which point this RPC becomes redundant and gets dropped in
-- Phase 6 (same fate as get_visible_students_with_stats).

create or replace function public.get_visible_student_by_id(target_id uuid)
returns table (
  user_id           uuid,
  email             text,
  first_name        text,
  last_name         text,
  target_sat_score  integer,
  high_school       text,
  graduation_year   integer,
  sat_test_date     timestamptz,
  total_attempts    bigint,
  correct_attempts  bigint,
  week_attempts     bigint,
  last_activity_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Delegate visibility to the canonical §3.8 helper. Returns an
  -- empty set if the caller can't see this student, which the
  -- page translates to notFound().
  with permitted as (
    select target_id as uid
    where public.can_view(target_id)
  ),
  attempts_agg as (
    select
      count(*) filter (where a.source = 'practice')                                    as total_attempts,
      count(*) filter (where a.source = 'practice' and a.is_correct)                   as correct_attempts,
      count(*) filter (where a.source = 'practice' and a.created_at >= now() - interval '7 days') as week_attempts,
      max(a.created_at) filter (where a.source = 'practice')                           as last_activity_at
    from public.attempts a
    where a.user_id = target_id
  )
  select
    p.id                                                 as user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.target_sat_score,
    p.high_school,
    p.graduation_year,
    p.sat_test_date,
    coalesce(agg.total_attempts, 0),
    coalesce(agg.correct_attempts, 0),
    coalesce(agg.week_attempts, 0),
    agg.last_activity_at
  from permitted v
  join public.profiles p on p.id = v.uid
  cross join attempts_agg agg;
$$;

comment on function public.get_visible_student_by_id(uuid) is
  'Returns a single student''s profile + practice stats if the caller can see them per can_view() from §3.8. SECURITY DEFINER so it bypasses the narrow profiles RLS. Becomes redundant when Phase 2 step 9 rewrites profiles RLS to use can_view() directly.';

revoke all on function public.get_visible_student_by_id(uuid) from public;
revoke all on function public.get_visible_student_by_id(uuid) from anon;
grant execute on function public.get_visible_student_by_id(uuid) to authenticated;
