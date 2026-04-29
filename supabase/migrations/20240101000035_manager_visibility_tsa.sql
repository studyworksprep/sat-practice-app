-- Manager visibility into teacher_student_assignments.
--
-- Bug surface: /tutor/teachers (manager → team list) joined the
-- manager's teachers to their rosters via teacher_student_assignments,
-- but the table's SELECT policy only allowed admins, the teacher
-- themselves, or the student. A manager wasn't any of those, so
-- the join returned zero rows, and every per-teacher cohort
-- statistic on the page came back blank (zero students, zero
-- attempts, no last-activity timestamp). The legacy
-- fix_manager_student_visibility migration widened profiles +
-- scores + registrations for managers but left this junction
-- table behind.
--
-- Fix: add a manager → teacher branch to the SELECT policy via
-- can_view(teacher_id), which already encodes "self / admin /
-- direct teacher / direct manager / transitive manager / class
-- enrollment". can_view() is SECURITY DEFINER so the inner
-- subquery against teacher_student_assignments doesn't recurse.
-- INSERT and DELETE policies stay admin-only — managers can't
-- mint or remove teacher↔student edges.

drop policy if exists tsa_select on public.teacher_student_assignments;
create policy tsa_select on public.teacher_student_assignments
  for select using (
    public.is_admin()
    or teacher_id = auth.uid()
    or student_id = auth.uid()
    or public.can_view(teacher_id)
    or public.can_view(student_id)
  );
