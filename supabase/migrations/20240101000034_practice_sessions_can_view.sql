-- practice_sessions RLS — open SELECT / INSERT / UPDATE to the
-- standard can_view() hierarchy.
--
-- The original policy (20240101000003) was owner-only on the
-- assumption that practice_sessions was ephemeral working state.
-- That stopped being true once the new tree promoted sessions to
-- the binding for assignment reports — every tutor / manager
-- read of `/tutor/sessions/[id]` and every cohort-page query
-- against practice_sessions was silently returning zero rows for
-- non-self users.
--
-- New policies:
--   SELECT — owner OR can_view(user_id). Tutors can read their
--            students' sessions; managers can read trainee +
--            transitive-student sessions; admins everything.
--   INSERT — owner OR can_view(user_id). Lets a tutor create a
--            session on a student's behalf via the cohort-page
--            "Submit for student" override, so the report has a
--            real session row to link to.
--   UPDATE — owner OR can_view(user_id). Same scope, so the
--            override can flip an in-progress session to
--            completed.
--   DELETE — unchanged (owner OR admin). No reason to hand out
--            destructive permissions to tutors.

drop policy if exists practice_sessions_select on public.practice_sessions;
create policy practice_sessions_select on public.practice_sessions
  for select using (
    user_id = auth.uid()
    or public.can_view(user_id)
  );

drop policy if exists practice_sessions_insert on public.practice_sessions;
create policy practice_sessions_insert on public.practice_sessions
  for insert with check (
    user_id = auth.uid()
    or public.can_view(user_id)
  );

drop policy if exists practice_sessions_update on public.practice_sessions;
create policy practice_sessions_update on public.practice_sessions
  for update
  using (user_id = auth.uid() or public.can_view(user_id))
  with check (user_id = auth.uid() or public.can_view(user_id));

-- DELETE policy untouched. (Owner OR admin from the original
-- migration.)
