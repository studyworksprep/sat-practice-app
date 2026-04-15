-- =========================================================
-- Base SELECT/INSERT/UPDATE policies on practice_test_attempts
-- =========================================================
-- Originally part of add_teacher_student_assignments.sql, split
-- out into this file when that migration was renamed to
-- 20230101000002 to fix the dev-replay ordering. The policies
-- below were written against practice_test_attempts, which in
-- the ordered replay gets created by
-- 20240101000000_create_practice_tests_schema.sql — so the
-- policy file has to sort AFTER that schema file.
--
-- The pta_select policy defined here is later replaced by
-- fix_manager_practice_test_visibility.sql (legacy alphabetic
-- migration, sorts later) with a more permissive version that
-- also covers the manager → tutor → student transitive chain.
-- Both DROP POLICY IF EXISTS + CREATE POLICY, so the final
-- state matches production.

alter table public.practice_test_attempts enable row level security;

drop policy if exists pta_select on public.practice_test_attempts;
create policy pta_select on public.practice_test_attempts
  for select using (
    user_id = auth.uid()
    or public.teacher_can_view_student(user_id)
  );

drop policy if exists pta_insert_self on public.practice_test_attempts;
create policy pta_insert_self on public.practice_test_attempts
  for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists pta_update_self on public.practice_test_attempts;
create policy pta_update_self on public.practice_test_attempts
  for update
  using  (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());
