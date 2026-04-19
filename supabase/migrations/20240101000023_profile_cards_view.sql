-- Phase 4 — parameterized can_view + profile_cards view.
--
-- Motivation: student-facing pages (dashboard, assignments list,
-- assignment detail) need to display the teacher's name (and later
-- the teacher's avatar). The existing profiles SELECT policy uses
-- can_view(id), which flows downward only — teachers see their
-- students, students do NOT see their teachers. So nested
-- `teacher:profiles(...)` selects return null for the student.
--
-- Two changes here, designed to preserve §3.8's "one place to change
-- the hierarchy" invariant:
--
-- 1) Refactor can_view so the hierarchy walk is parameterized on
--    the viewer id. The existing can_view(target) becomes a thin
--    wrapper that passes auth.uid() as the viewer. Nothing about
--    the public API or existing RLS callers changes; the body is
--    just factored into a helper the rest of this migration can
--    reuse with different arguments.
--
-- 2) Add a profile_cards VIEW exposing the minimum public-within-
--    org-chain subset of columns (id, first_name, last_name, role,
--    tutor_name). The view has its own visibility predicate
--    (can_view forward OR can_view_from reverse), expressed
--    entirely in terms of can_view_from — so the hierarchy
--    definition still lives in exactly one place.
--
-- Consequences:
--   - Adding a new tier (district admin etc.) is still a one-edit
--     change inside can_view_from.
--   - Adding a new column to profiles does NOT automatically
--     leak to the reverse-visibility direction. Whoever adds the
--     column decides whether it belongs in profile_cards.
--   - profiles' existing SELECT policy is unchanged. Full profile
--     access still requires can_view forward.

-- ============================================================
-- 1. Generalized hierarchy walk.
--    Pure relational paths: self + downward tutor/manager chain.
--    Admin is NOT here; the caller-facing wrapper can_view(target)
--    adds admin via the JWT helper, and the profile_cards view uses
--    can_view(id) for the forward clause which picks admin up there.
-- ============================================================

create or replace function public.can_view_from(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Self.
    viewer = target

    -- Direct tutor -> student.
    or exists (
      select 1
      from public.teacher_student_assignments tsa
      where tsa.teacher_id = viewer
        and tsa.student_id = target
    )

    -- Direct manager -> tutor.
    or exists (
      select 1
      from public.manager_teacher_assignments mta
      where mta.manager_id = viewer
        and mta.teacher_id = target
    )

    -- Transitive manager -> student via a tutor the manager oversees.
    or exists (
      select 1
      from public.manager_teacher_assignments mta
      join public.teacher_student_assignments tsa using (teacher_id)
      where mta.manager_id = viewer
        and tsa.student_id = target
    )

    -- Class-based legacy path. Retires in Phase 6 along with the
    -- rest of class_enrollments.
    or exists (
      select 1
      from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where ce.student_id = target
        and c.teacher_id = viewer
    );
$$;

comment on function public.can_view_from(uuid, uuid) is
  'Hierarchy walk: returns true if viewer can see target via the supervisory chain. Self + direct/transitive downward paths. Admin is handled by the caller-facing can_view(target) wrapper, not here.';

revoke all on function public.can_view_from(uuid, uuid) from public;
revoke all on function public.can_view_from(uuid, uuid) from anon;
grant execute on function public.can_view_from(uuid, uuid) to authenticated;

-- ============================================================
-- 2. can_view(target) — rewrite body as thin wrapper.
--    Same public shape, same return value for every existing caller.
--    The back-test from Phase 1 already verified can_view against
--    the pre-consolidation helpers; this refactor keeps those same
--    decisions (admin via JWT + self + downward chain).
-- ============================================================

create or replace function public.can_view(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or public.can_view_from(auth.uid(), target);
$$;

-- Re-assert grants (the create-or-replace doesn't touch privileges
-- but being explicit documents the intent).
revoke all on function public.can_view(uuid) from public;
revoke all on function public.can_view(uuid) from anon;
grant execute on function public.can_view(uuid) to authenticated;

-- ============================================================
-- 3. profile_cards view — minimum public-within-org subset.
--    Any new profile column is EXCLUDED from the reverse-visibility
--    direction by default. Including a column in this view is an
--    explicit, reviewed act.
--    Current column set — just enough for "who assigned me this"
--    and "who is this person" display needs:
--      id, first_name, last_name, role, tutor_name
--    avatar_url will join the set when the column lands on profiles.
-- ============================================================

create or replace view public.profile_cards
with (security_invoker = false)
as
select
  p.id,
  p.first_name,
  p.last_name,
  p.role,
  p.tutor_name
from public.profiles p
where
  -- Forward: the caller can see rows owned by this profile. Covers
  -- self (auth.uid() = id) + admin + teacher viewing student etc.
  public.can_view(p.id)
  -- Reverse: this profile's owner can see rows owned by the caller.
  -- Covers student viewing teacher etc.
  or public.can_view_from(p.id, auth.uid());

comment on view public.profile_cards is
  'Minimum public-within-hierarchy profile subset. Symmetric visibility: anyone in the supervisory chain (either direction) can read the card. Add columns explicitly — defaulting to exclusion prevents accidental leaks.';

revoke all on public.profile_cards from public, anon;
grant select on public.profile_cards to authenticated;
