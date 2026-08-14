-- Align act_attempts read visibility with the platform's can_view()
-- hierarchy (admin, direct tutor, manager via managed tutors).
--
-- Context: act_attempts got its RLS in the original ACT tables
-- migration (20230101000020), before can_view() became the standard.
-- Its only read paths were owner-self and a direct
-- teacher_student_assignments row — so staff without a direct
-- assignment row (admins, managers overseeing a student's tutor) got
-- zero rows back, and every ACT session report they opened rendered
-- all questions "unanswered" with 0/0 metrics (diagnosed 2026-08-10).
-- The SAT side (attempts_select → list_visible_users()) and the newer
-- act_practice_test_attempts (can_view(user_id)) already grant the
-- full hierarchy.
--
-- act_attempts_select_own stays as the cheap owner fast path.
-- act_attempts_teacher_read is dropped: its direct-teacher predicate
-- is a strict subset of can_view(user_id).

drop policy if exists "act_attempts_teacher_read" on public.act_attempts;

create policy "act_attempts_select_visible" on public.act_attempts
  for select to authenticated
  using (public.can_view(user_id));
