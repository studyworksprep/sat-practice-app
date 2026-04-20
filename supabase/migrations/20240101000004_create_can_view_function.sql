-- =========================================================
-- can_view(target) — unified visibility model
-- =========================================================
-- See docs/architecture-plan.md §3.8 for the full rationale.
--
-- The current RLS implementation re-derives "can this user
-- see this row" independently on every user-owned table.
-- `teacher_can_view_student()` is called from seven migration
-- files; manager visibility has needed three separate
-- `fix_manager_*_visibility.sql` patches to chase drift; the
-- cross-tier `manager -> teacher -> student` path is
-- implemented differently in each policy that needs it.
--
-- `can_view(target_user_id)` collapses the whole thing into
-- one function. Every supervisory relationship — self, admin,
-- tutor -> student, manager -> tutor, manager -> student via
-- tutor — lives here, and RLS policies across the app reduce
-- to `using (can_view(user_id))`.
--
-- IMPORTANT: this migration only DEFINES the function and a
-- companion `list_visible_users(role_filter)` helper. It does
-- NOT rewrite any existing RLS policy. The Phase 1 back-test
-- script (scripts/can_view_backtest.js) runs a read-only
-- comparison of `can_view` against the current helper stack
-- across every (viewer, target) pair in the dev snapshot.
-- Zero diffs is the precondition for Phase 2 to start
-- switching policies over.
-- =========================================================

create or replace function public.can_view(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Self: a user can always see their own rows.
    auth.uid() = target

    -- Admin: sees everything.
    or public.is_admin()

    -- Direct tutor -> student assignment.
    or exists (
      select 1
      from public.teacher_student_assignments tsa
      where tsa.teacher_id = auth.uid()
        and tsa.student_id = target
    )

    -- Direct manager -> tutor assignment.
    or exists (
      select 1
      from public.manager_teacher_assignments mta
      where mta.manager_id = auth.uid()
        and mta.teacher_id = target
    )

    -- Transitive manager -> student (via a tutor the manager oversees).
    or exists (
      select 1
      from public.manager_teacher_assignments mta
      join public.teacher_student_assignments tsa using (teacher_id)
      where mta.manager_id = auth.uid()
        and tsa.student_id = target
    )

    -- Class-based legacy path. Kept for backward compatibility with
    -- the existing teacher_can_view_student() helper until Phase 6
    -- retires class-based enrollments entirely.
    or exists (
      select 1
      from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where ce.student_id = target
        and c.teacher_id = auth.uid()
    );
$$;

comment on function public.can_view(uuid) is
  'Unified visibility check: returns true if the calling user can see rows owned by `target`. Replaces the seven-place re-derivation of teacher -> student / manager -> tutor / manager -> student visibility. See docs/architecture-plan.md §3.8.';

revoke all on function public.can_view(uuid) from public;
revoke all on function public.can_view(uuid) from anon;
grant execute on function public.can_view(uuid) to authenticated;

-- =========================================================
-- list_visible_users(role_filter) — companion helper
-- =========================================================
-- Returns every user id the caller can see, optionally
-- filtered to a single role. Drives the "my students" /
-- "my tutors" / "my teachers" list pages so they can fetch
-- the set once without re-deriving the hierarchy.
--
-- Passing NULL or the empty string returns every visible
-- user regardless of role.
-- =========================================================

create or replace function public.list_visible_users(role_filter text default null)
returns table (user_id uuid, role text)
language sql
stable
security definer
set search_path = public
as $$
  -- Union every path by which the caller could see another user,
  -- then filter by role. DISTINCT at the end dedupes when a user
  -- is visible via more than one path.
  with visible as (
    -- Self
    select id as user_id from public.profiles where id = auth.uid()

    union

    -- Admin sees everyone
    select id as user_id from public.profiles
    where public.is_admin()

    union

    -- Direct students
    select tsa.student_id as user_id
    from public.teacher_student_assignments tsa
    where tsa.teacher_id = auth.uid()

    union

    -- Direct tutors
    select mta.teacher_id as user_id
    from public.manager_teacher_assignments mta
    where mta.manager_id = auth.uid()

    union

    -- Students of managed tutors
    select tsa.student_id as user_id
    from public.manager_teacher_assignments mta
    join public.teacher_student_assignments tsa using (teacher_id)
    where mta.manager_id = auth.uid()

    union

    -- Class-based legacy path
    select ce.student_id as user_id
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where c.teacher_id = auth.uid()
  )
  select distinct p.id as user_id, p.role
  from visible v
  join public.profiles p on p.id = v.user_id
  where role_filter is null
     or role_filter = ''
     or p.role = role_filter;
$$;

comment on function public.list_visible_users(text) is
  'Returns every user id the caller can see, optionally filtered by role. Companion to can_view() for listing UIs. See docs/architecture-plan.md §3.8.';

revoke all on function public.list_visible_users(text) from public;
revoke all on function public.list_visible_users(text) from anon;
grant execute on function public.list_visible_users(text) to authenticated;
