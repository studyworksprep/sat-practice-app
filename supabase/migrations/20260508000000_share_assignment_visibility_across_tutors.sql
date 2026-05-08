-- Allow tutors who share a student to view each other's assignments
-- + per-student reports on that shared student.
--
-- Before:
--   assignments_v2.av2_select        → can_view(teacher_id) OR is_v2_assignment_student(...)
--   assignment_students_v2.asv2_select → student_id = auth.uid()
--                                         OR EXISTS(... can_view(a.teacher_id))
--
-- can_view_from() only resolves through tutor → student or
-- manager → tutor chains. Two peer tutors aren't reachable from
-- each other, so tutor B couldn't see tutor A's assignment even
-- when both teach student S — even though B can already see S
-- everywhere else (profile, attempts, reports). 9 students in
-- production currently have multiple tutors (max 5).
--
-- After:
--   assignments_v2.av2_select picks up "any enrolled student is
--   visible to the viewer," which subsumes the manager-tutor-
--   student transitive case for free.
--
--   assignment_students_v2.asv2_select shifts to "the row's
--   student is visible to the viewer," which:
--     - keeps the student-self path (can_view returns true for
--       self via can_view_from's self rule)
--     - lets the viewer see only the rows for students they can
--       already see — A's other students stay hidden when B is
--       browsing A's assignment for shared S
--     - keeps the original-creator path (assignment_teacher_visible)
--       so a tutor sees every student row on their own assignment
--
-- Privacy outcome: when tutor B views tutor A's assignment for
-- shared S, B sees the assignment metadata + S's row in the
-- enrollment list, and B's cohort report on that assignment will
-- show only B's shared students. A's other students are not
-- exposed.
--
-- Mutations are unchanged: INSERT / UPDATE / DELETE on both tables
-- still require is_v2_assignment_teacher (assignment creator) or
-- is_admin. B can view but cannot add students, edit, archive, or
-- submit-on-behalf on A's assignment.
--
-- Two new SECURITY DEFINER helpers wrap the cross-table EXISTS
-- predicates to prevent RLS recursion: with definer + a fixed
-- search_path, the function reads the underlying tables without
-- re-triggering the calling table's RLS.

-- ──────────────────────────────────────────────────────────────
-- Helpers
-- ──────────────────────────────────────────────────────────────

create or replace function public.assignment_has_visible_student(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignment_students_v2 asv
    where asv.assignment_id = p_assignment_id
      and public.can_view(asv.student_id)
  );
$$;

create or replace function public.assignment_teacher_visible(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.assignments_v2 a
    where a.id = p_assignment_id
      and public.can_view(a.teacher_id)
  );
$$;

-- ──────────────────────────────────────────────────────────────
-- Policies
-- ──────────────────────────────────────────────────────────────

alter policy av2_select on public.assignments_v2
  using (
    public.can_view(teacher_id)
    or public.is_v2_assignment_student(id, auth.uid())
    or public.assignment_has_visible_student(id)
  );

alter policy asv2_select on public.assignment_students_v2
  using (
    public.can_view(student_id)
    or public.assignment_teacher_visible(assignment_id)
  );
