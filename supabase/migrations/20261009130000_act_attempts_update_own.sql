-- =========================================================
-- act_attempts: let a student update their own attempt row
-- =========================================================
-- ACT practice tests now run the shared runner in test mode, where
-- the student may change an answer until the set is submitted. The
-- submit action updates the existing act_attempts row in place
-- (lib/practice/session-actions.ts) — but the table only had
-- select/insert policies for students, so the update silently
-- affected zero rows. Mirrors attempts_update_self on the SAT
-- attempts table (20230101000001_create_account_tiers.sql).

drop policy if exists act_attempts_update_own on public.act_attempts;

create policy act_attempts_update_own on public.act_attempts
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
