-- =========================================================
-- get_visible_student_attempts — recent attempts for a single
-- student, gated on can_view()
-- =========================================================
-- Companion to get_visible_student_by_id (migration
-- 20240101000007). That function returns the student's
-- profile and aggregate stats; this one returns their recent
-- individual attempt rows.
--
-- Why this exists: the tutor student detail page originally
-- read attempts via a plain supabase.from('attempts').select()
-- query, under the assumption that the attempts table's SELECT
-- policy already included the manager → tutor → student
-- transitive path (from the pre-existing
-- fix_manager_practice_test_visibility.sql migration). It
-- turns out that policy either wasn't fully applied in
-- production or was later modified, so plain RLS queries
-- silently return zero rows for transitive students — the
-- direct-student path works fine but a manager viewing their
-- assigned tutor's student gets an empty attempts list even
-- though the stats (via the security-definer RPC) show
-- activity.
--
-- Fix: this RPC. SECURITY DEFINER bypasses the attempts RLS
-- entirely. Visibility is enforced by delegating to can_view()
-- — the §3.8 canonical hierarchy helper. One place for the
-- rules, no drift.
--
-- Phase 2 step 9 eventually makes this RPC redundant by
-- rewriting the attempts RLS policy to use can_view(user_id)
-- directly. At that point the detail page can go back to a
-- plain supabase.from('attempts').select() query and this
-- function gets dropped in Phase 6.

create or replace function public.get_visible_student_attempts(
  target_id uuid,
  p_limit integer default 50
)
returns table (
  id                 uuid,
  question_id        uuid,
  is_correct         boolean,
  selected_option_id uuid,
  response_text      text,
  time_spent_ms      integer,
  source             text,
  created_at         timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.question_id,
    a.is_correct,
    a.selected_option_id,
    a.response_text,
    a.time_spent_ms,
    a.source,
    a.created_at
  from public.attempts a
  where a.user_id = target_id
    and public.can_view(target_id)
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

comment on function public.get_visible_student_attempts(uuid, integer) is
  'Returns recent attempts for a single student if the caller can_view() them. SECURITY DEFINER because the attempts RLS policy does not cover the transitive manager → tutor → student path in this database (a gap Phase 2 step 9 fixes by rewriting the policy to use can_view). Used by /tutor/students/[id].';

revoke all on function public.get_visible_student_attempts(uuid, integer) from public;
revoke all on function public.get_visible_student_attempts(uuid, integer) from anon;
grant execute on function public.get_visible_student_attempts(uuid, integer) to authenticated;
