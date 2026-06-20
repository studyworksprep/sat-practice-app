-- Stage D-7 of the legacy-tree decommission: re-point
-- question_concept_tags.question_id from the v1 questions table to
-- questions_v2.
--
-- The schema drift this fixes: question_concept_tags was created
-- when only the v1 questions table existed; its FK targets
-- public.questions(id). Post-cutover the application started
-- inserting concept tags from new-tree code paths that only know
-- v2 ids, so writers had to translate v2 → v1 via question_id_map
-- before every insert (see lib/practice/legacy-id-map.ts). Worse,
-- v2 questions imported after the cutover (Studyworks-authored
-- questions with no v1 counterpart) could not be tagged at all —
-- the action failed with "this question has no v1 counterpart
-- yet".
--
-- Pre-flight verification confirmed 1,722 / 1,722 rows have a
-- v2 mapping in question_id_map, every mapping target exists in
-- questions_v2, and zero (v2_qid, tag_id) pairs would collide
-- after translation. Safe to UPDATE in place.
--
-- Order of operations:
--   1. Drop the v1 FK so the UPDATE can rewrite question_id values
--      that aren't in public.questions(id).
--   2. UPDATE all 1,722 rows to their v2 ids via question_id_map.
--   3. Add the new FK to questions_v2.
--   4. NOTIFY pgrst.
--
-- After this migration the application no longer needs to call
-- resolveLegacyQuestionId on the write path; lib/practice/
-- concept-tags-actions.ts is simplified in the same commit.

-- 1. Drop the v1 FK.
alter table public.question_concept_tags
  drop constraint if exists question_concept_tags_question_id_fkey;

-- 2. Translate v1 ids to v2 ids in place.
update public.question_concept_tags qct
set question_id = m.new_question_id
from public.question_id_map m
where m.old_question_id = qct.question_id;

-- 3. Re-add the FK, now pointing at questions_v2. ON DELETE CASCADE
--    so tags are cleaned up when a v2 question is hard-deleted.
alter table public.question_concept_tags
  add constraint question_concept_tags_question_id_fkey
  foreign key (question_id)
  references public.questions_v2(id)
  on delete cascade;

-- 4. Refresh PostgREST.
notify pgrst, 'reload schema';
