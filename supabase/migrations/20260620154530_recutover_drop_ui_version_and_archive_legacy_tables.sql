-- Re-cutover after PR #167 deployed the full Stage D branch to
-- production. The hotfix at 20260620153132 had restored
-- profiles.ui_version and unarchived the 3 legacy tables because
-- the deploy lagged the migrations. Once the new code was live the
-- column and the tables could safely retire again.
--
-- The narrowed sync_role_trigger column list (role, is_demo) and
-- the slimmed sync_role_to_auth_metadata function body are kept as
-- D-2 left them — the hotfix didn't restore them, so this re-drop
-- has no column-list dependency to fight.

alter table public.profiles drop column ui_version;

alter table public.lesson_assignment_students set schema _legacy;
alter table public.lesson_assignments         set schema _legacy;
alter table public.question_status            set schema _legacy;

notify pgrst, 'reload schema';
