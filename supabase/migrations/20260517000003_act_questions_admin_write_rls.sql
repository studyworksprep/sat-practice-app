-- =========================================================
-- act_questions / act_answer_options — admin-write policies
-- =========================================================
-- The original act tables migration (20230101000020) enabled
-- RLS on both tables and added only public SELECT policies.
-- That suffices for the runner (every authenticated user can
-- read), but it silently blocks the import-pipeline approval
-- step: the bulkApprove / approveDraft Server Actions
-- (admin/act/imports/[jobId]/review/actions.ts) insert into
-- act_questions + act_answer_options, and without an
-- INSERT/UPDATE/DELETE policy the inserts get RLS-denied for
-- every approve attempt.
--
-- This migration adds the missing admin-write policy, mirroring
-- the shape already used on act_import_jobs +
-- act_question_drafts.
--
-- Read policy is unchanged — every authenticated user keeps
-- their SELECT access. The demo-readonly INSERT/UPDATE/DELETE
-- policies remain in effect for is_demo() users; the admin
-- write policy adds an OR'd path for is_admin().

create policy act_questions_admin_write on public.act_questions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy act_answer_options_admin_write on public.act_answer_options
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

notify pgrst, 'reload schema';
