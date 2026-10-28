-- =========================================================
-- act_questions: one live row per (form, section, number)
-- act_question_drafts.linked_existing
-- =========================================================
-- ACT parity Phase 2 PR C (data hygiene). The importer's approve
-- step used to insert unconditionally, so re-importing a form to
-- pick up questions the first parse missed (ACT-2026-April-FormJ01
-- has 40/41/27/34 of 50/45/36/40) would have duplicated every
-- question that was already there.
--
-- Approve now "fills gaps": a draft whose (source_test, section,
-- source_ordinal) already has a live question links to that
-- question (approved_to_id) instead of inserting, and the draft
-- records linked_existing = true so unapprove/reject clear the
-- link rather than deleting a question the import never created.
-- The partial unique index is the backstop for the same rule at
-- the database level. Retired rows (deleted_at set) are excluded
-- so an admin can retire a bad question and approve a re-parsed
-- replacement under the same number.
--
-- Production audit (2026-10-12): zero duplicate groups, zero rows
-- with a null source_test or source_ordinal.

create unique index if not exists act_questions_form_ordinal_live_key
  on public.act_questions (source_test, section, source_ordinal)
  where deleted_at is null
    and source_test is not null
    and source_ordinal is not null;

alter table public.act_question_drafts
  add column if not exists linked_existing boolean not null default false;

comment on index public.act_questions_form_ordinal_live_key is
  'One live question per (source_test, section, source_ordinal). The import approve step links a draft to an existing live row instead of inserting; retired rows are exempt so a replacement can be approved under the same number.';

comment on column public.act_question_drafts.linked_existing is
  'True when approve linked this draft to a question that already existed (fill-gaps re-import) rather than inserting one. Unapprove/reject then only clear approved_to_id.';
