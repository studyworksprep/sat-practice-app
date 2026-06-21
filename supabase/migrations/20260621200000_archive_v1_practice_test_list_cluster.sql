-- Archive the v1 practice-test list cluster.
--
--   practice_tests              8 rows  (perfect mirror of practice_tests_v2)
--   practice_test_modules      48 rows  (perfect mirror of practice_test_modules_v2)
--   practice_test_module_items 1176 rows (perfect mirror of practice_test_module_items_v2)
--
-- Verified state:
--   * Six readers across three files (testScoreHelper, bluebook-batch,
--     upload-bluebook) and one dead /api/practice-tests route were
--     repointed / deleted in the same commit.
--   * Row counts identical to the _v2 siblings on all three tables;
--     no triggers kept them in sync (manual upkeep historically), so
--     halting the v1 surface today doesn't lose any data.
--   * No DB function, view, or policy references the v1 tables beyond
--     the FKs the cluster carries on itself (intra-cluster + two
--     already-_legacy children).
--
-- FKs that survive the move:
--   _legacy.practice_test_item_attempts.practice_test_module_item_id
--     → _legacy.practice_test_module_items(id)
--   _legacy.practice_test_module_attempts.practice_test_module_id
--     → _legacy.practice_test_modules(id)
--   _legacy.question_status (if still cross-FKing — unrelated cluster)
--   _legacy.answer_options.question_version_id  → public.question_versions(id)
--   _legacy.correct_answers.question_version_id → public.question_versions(id)
--
-- The last two cross-schema FKs to public.question_versions are
-- intentionally untouched here; they belong to the v1 question
-- cluster which is the next domino.
--
-- Order: children first, since SET SCHEMA cleanly handles cross-schema
-- FKs but the readable order makes intent obvious.

alter table public.practice_test_module_items set schema _legacy;
alter table public.practice_test_modules      set schema _legacy;
alter table public.practice_tests             set schema _legacy;

notify pgrst, 'reload schema';
