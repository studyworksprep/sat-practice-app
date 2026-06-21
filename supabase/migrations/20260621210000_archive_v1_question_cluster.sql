-- Final archive of the v1 question cluster.
--
--   questions          3428 rows
--   question_versions  3428 rows
--   question_taxonomy  3428 rows
--   question_id_map    3428 rows (the v1↔v2 translation table)
--
-- This is the closing step of the v1 question rebuild. Every reader
-- has been moved off v1; the weak-queue helpers no longer walk
-- question_id_map; the four remaining read-fallbacks in
-- build-session-review, load-desmos-saved-state, desmos-actions, and
-- notes/actions are removed in the same commit. The only remaining
-- in-the-wild v1 ids were 140 stale entries in
-- practice_sessions.question_ids; this migration backfills them.
--
-- Pre-flight verification:
--   * assignments_v2.question_ids: 5305/5305 v2-keyed, 0 v1
--   * practice_sessions.question_ids (SAT): 10473 v2, 140 v1 backfillable;
--     ACT entries (623) are act_questions ids and untouched
--   * questions_current view has zero app-code callers; only types-file
--     references it as a FK target relation
--   * No DB function, view (besides questions_current), or policy
--     references the four tables beyond intra-cluster FKs and the
--     cross-schema FKs from already-_legacy tables
--   * All RLS policies on the four tables are self-contained
--     (auth.uid()/is_admin()/is_demo() only) and travel with SET SCHEMA
--
-- After this migration, the public schema has no v1 question cluster
-- presence. The _legacy schema holds the historical artifact for
-- audit; cross-schema FKs from _legacy.answer_options,
-- _legacy.correct_answers, _legacy.practice_test_module_items, and
-- _legacy.question_status to public.{questions,question_versions}
-- automatically become _legacy → _legacy.

-- 1. Backfill the 140 v1 SAT ids in practice_sessions.question_ids.
update public.practice_sessions ps
set question_ids = (
  select jsonb_agg(
    case
      when m.new_question_id is not null then to_jsonb(m.new_question_id::text)
      else to_jsonb(e.val)
    end
    order by e.ord
  )
  from jsonb_array_elements_text(ps.question_ids) with ordinality as e(val, ord)
  left join public.question_id_map m on m.old_question_id::text = e.val
)
where ps.question_ids is not null
  and jsonb_typeof(ps.question_ids) = 'array'
  and exists (
    select 1 from jsonb_array_elements_text(ps.question_ids) as e2(val)
    where exists (
      select 1 from public.question_id_map m2
      where m2.old_question_id::text = e2.val
    )
  );

-- 2. Drop the dead `questions_current` view (joins v1 questions +
--    question_versions + question_taxonomy to expose the "current"
--    row per question; zero callers, superseded by questions_v2).
drop view if exists public.questions_current;

-- 3. Archive the four v1 tables. Order is children-first for
--    readability; SET SCHEMA handles cross-schema FK retargeting
--    automatically so any order works in practice.
alter table public.question_id_map     set schema _legacy;
alter table public.question_taxonomy   set schema _legacy;
alter table public.question_versions   set schema _legacy;
alter table public.questions           set schema _legacy;

-- 4. Drop the PostgREST schema cache.
notify pgrst, 'reload schema';
