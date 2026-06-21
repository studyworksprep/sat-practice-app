-- Stage E follow-up #3: archive the v1 MCQ answer-cluster.
--
-- After the prior commit dropped the load-test-results fallback,
-- there are zero app-code readers of public.answer_options and
-- public.correct_answers. Move them to the _legacy schema so
-- PostgREST stops exposing them and any forgotten caller (or a
-- regression that re-introduces a v1 reference) fails loudly.
--
-- Cross-schema FK references continue to work:
--   _legacy.correct_answers.correct_option_id → _legacy.answer_options(id)
--   _legacy.answer_options.question_version_id → public.question_versions(id)
--   _legacy.correct_answers.question_version_id → public.question_versions(id)
-- The first stays intact because both tables move together; the
-- last two become cross-schema, which Postgres handles fine.
--
-- Two DB functions referenced these tables by unqualified name:
--   public.migrate_questions_batch(int)
--   public.backfill_questions_v2_correct_labels()
-- Both are SQL-editor one-shot v1→v2 migration helpers. The
-- migration is 100% complete (3428 / 3428 questions, 0 backfill
-- rows remaining) and neither function is called from any app
-- route. Drop rather than repoint — repointing only these two
-- references would still leave them pointing at unqualified
-- `questions` / `question_versions` / `question_taxonomy` /
-- `question_id_map`, all of which are next in line to archive.
--
-- public.migration_status() is left in place: it doesn't reference
-- either table being moved.

drop function if exists public.migrate_questions_batch(integer);
drop function if exists public.backfill_questions_v2_correct_labels();

alter table public.correct_answers set schema _legacy;
alter table public.answer_options  set schema _legacy;

notify pgrst, 'reload schema';
