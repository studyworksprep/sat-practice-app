-- Let managers write question corrections (questions_v2 UPDATE)
--
-- The per-question "Broken?" panel (lib/practice/BrokenButton.jsx →
-- lib/practice/broken-actions.js) is gated to manager + admin at the
-- app layer via requireRole(['manager', 'admin']). The database
-- disagreed: the only permissive write policy on questions_v2 was
-- `questions_v2_admin_all` (USING is_admin(), i.e. app_metadata.role
-- = 'admin'), so a manager's UPDATE matched no policy and was
-- filtered to zero rows.
--
-- Postgres does not raise on an UPDATE that matches no rows, and
-- PostgREST returns 204 with no error, so the Server Action reported
-- success while nothing was written — corrections and broken flags
-- from managers were silently discarded.
--
-- Fix: a permissive UPDATE policy keyed on is_manager()
-- (role in ('manager', 'admin')) — the same helper that already
-- grants manager writes on concept_tags, question_concept_tags and
-- desmos_saved_states. UPDATE only: creating and deleting bank
-- questions stays admin-only via questions_v2_admin_all.
--
-- The restrictive demo_readonly_update policy still applies on top,
-- so demo accounts remain read-only.

drop policy if exists questions_v2_manager_update on public.questions_v2;

create policy questions_v2_manager_update
  on public.questions_v2
  for update
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());
