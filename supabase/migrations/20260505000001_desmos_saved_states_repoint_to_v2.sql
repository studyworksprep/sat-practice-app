-- desmos_saved_states.question_id was wired to the legacy v1
-- questions(id) when the table was created. The new tree (and the
-- saveDesmosState Server Action) operates entirely in v2 ids, so a
-- manager saving a state on a question they reached through the
-- new UI now hits the FK with a uuid that doesn't exist in v1 —
-- insert/upsert fails with desmos_saved_states_question_id_fkey.
--
-- All 121 existing rows still hold v1 ids and every one of them
-- maps cleanly through question_id_map to a row that exists in
-- questions_v2 (verified before writing this migration; no v2
-- collisions, no missing v2 targets). So the migration is:
--
--   1. translate the existing rows v1 → v2
--   2. drop the v1 FK
--   3. add the same FK pointed at questions_v2(id)
--
-- The unique (question_id) constraint stays put — translating
-- doesn't introduce duplicates per the pre-flight check.

-- The drop has to come BEFORE the update — the update writes v2
-- ids into question_id, and those v2 ids don't exist in v1
-- questions, so the legacy FK rejects them mid-statement if it's
-- still attached.

begin;

-- 1. Drop the old FK to v1 questions.
alter table public.desmos_saved_states
  drop constraint if exists desmos_saved_states_question_id_fkey;

-- 2. Repoint existing rows. join on question_id_map; rows that
--    aren't covered by the map (none today) are left alone and
--    will fail step 3 visibly rather than silently.
update public.desmos_saved_states d
set    question_id = m.new_question_id,
       updated_at  = now()
from   public.question_id_map m
where  m.old_question_id = d.question_id;

-- 3. Re-add the FK pointed at v2. on delete cascade preserved so
--    a deleted question still cleans up its saved Desmos state.
alter table public.desmos_saved_states
  add constraint desmos_saved_states_question_id_fkey
  foreign key (question_id) references public.questions_v2(id) on delete cascade;

commit;
