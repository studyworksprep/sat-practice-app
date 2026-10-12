-- =========================================================
-- ACT form rename: '2024-Sep' → 'ACT-2024-Sep', '2025-Oct' → 'ACT-2025-Oct'
-- =========================================================
-- ACT parity Phase 2 PR C (data hygiene). Two manually imported
-- math sets carried bare year-month names; every other form uses
-- the 'ACT-<year>-<month>[-<form>]' convention and the owner
-- confirmed (2026-10-10) that year-month identifies a test. After
-- the rename 'ACT-2025-Oct' spans two sections (the English set
-- imported under the prefixed name plus this math set), so the ACT
-- tests hub shows it as one two-section card. Multi-section forms
-- start untimed until Phase 3 lands section timing.
--
-- 'ACT-25MC1' / 'ACT-25MC5' are math-only practice sets and keep
-- their names.
--
-- Production audit (2026-10-12): only act_questions rows carry the
-- old names. The other updates below are no-ops there and exist so
-- the migration is self-contained wherever it runs. Idempotent.

update public.act_questions
   set source_test = 'ACT-' || source_test
 where source_test in ('2024-Sep', '2025-Oct');

update public.act_question_drafts
   set source_test = 'ACT-' || source_test
 where source_test in ('2024-Sep', '2025-Oct');

update public.act_import_jobs
   set source_test = 'ACT-' || source_test
 where source_test in ('2024-Sep', '2025-Oct');

update public.act_score_conversion
   set source_test = 'ACT-' || source_test
 where source_test in ('2024-Sep', '2025-Oct');

update public.act_practice_test_attempts
   set source_test = 'ACT-' || source_test
 where source_test in ('2024-Sep', '2025-Oct');

update public.practice_sessions
   set filter_criteria = jsonb_set(
         filter_criteria,
         '{source_test}',
         to_jsonb('ACT-' || (filter_criteria->>'source_test'))
       )
 where test_type = 'act'
   and filter_criteria->>'source_test' in ('2024-Sep', '2025-Oct');
