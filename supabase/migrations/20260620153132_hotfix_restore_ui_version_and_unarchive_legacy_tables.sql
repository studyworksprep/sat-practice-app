-- HOTFIX (2026-06-20): undo the Stage D-2 column drop and the Stage
-- D-5 table archival because production code was deployed BEHIND
-- those migrations. The deployed lib/api/auth.js still selected
-- profiles.ui_version on every page load, so once D-2 dropped the
-- column every request 500'd with "Failed to load profile". Old
-- /learn page reads against lesson_assignments and the old external
-- student-summary endpoint reads against question_status would have
-- followed.
--
-- Restoration:
--   * Re-add profiles.ui_version text not null default 'next'. The
--     default backfills all 72 existing rows to 'next', which is
--     what every row held before the drop.
--   * Move the 3 archived tables back from _legacy to public.
--     Their data is untouched (the archive was a SET SCHEMA, not a
--     DROP), so this is a clean restoration.
--
-- Not restored:
--   * The force_ui_version row in feature_flags. Nothing in app
--     code consumed it; the external poller that still hits this
--     key handles an empty result as the no-override default.
--   * The sync_role_to_auth_metadata function signature and the
--     sync_role_trigger column list. Both were narrowed in D-2 and
--     have no application-side reader of the ui_version JWT mirror,
--     so leaving them narrow is harmless.
--   * The dropped orphan functions (sync_lesson_assignment_to_v2,
--     etc.). Those were never bound to triggers in production after
--     D-1 removed their last caller; restoring them would just
--     re-introduce dead code.
--   * The D-7 question_concept_tags FK + data migration. Old code
--     reads still match (load-concept-tags.js queries the v2 union);
--     writes are admin-only and fail until deploy. Trade-off chosen
--     to avoid the v2→v1 data reverse-translation.
--
-- The Stage D-2 + D-5 changes will be reapplied as a follow-up
-- migration once the Stage D branch is live in production.

alter table public.profiles
  add column if not exists ui_version text not null default 'next';

alter table _legacy.question_status            set schema public;
alter table _legacy.lesson_assignments         set schema public;
alter table _legacy.lesson_assignment_students set schema public;

notify pgrst, 'reload schema';
