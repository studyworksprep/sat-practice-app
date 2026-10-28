-- =========================================================
-- ACT assignments (ACT parity Phase 4, PR B)
-- =========================================================
-- assignments_v2 / assignment_students_v2 already carry test_type
-- ('sat' | 'act', migration 20260513000000) as forward-wiring. This
-- adds the two columns an ACT assignment actually needs:
--
--   assignments_v2.act_source_test   the ACT form an ACT
--                                    practice_test assignment points
--                                    at (act_questions.source_test);
--                                    practice_test_id stays SAT-only.
--   assignment_templates.test_type   a saved recipe is SAT or ACT —
--                                    the filter_criteria shapes differ
--                                    (skill selections vs section /
--                                    category selections).
--
-- No data changes. Existing rows are SAT and keep their defaults.

alter table public.assignments_v2
  add column if not exists act_source_test text;

comment on column public.assignments_v2.act_source_test is
  'ACT practice_test assignments only: the form (act_questions.source_test) the student takes as a timed test. Null for SAT rows and for ACT question sets.';

alter table public.assignment_templates
  add column if not exists test_type text not null default 'sat'
    check (test_type in ('sat', 'act'));

comment on column public.assignment_templates.test_type is
  'Which bank the recipe samples from. SAT templates store skillSelections; ACT templates store actSelections (section + category).';

-- The per-type payload check predates ACT: a practice_test row had to
-- carry practice_test_id. An ACT practice test carries act_source_test
-- instead (question sets still need question_ids).
alter table public.assignments_v2
  drop constraint if exists assignments_v2_type_payload_present;
alter table public.assignments_v2
  add constraint assignments_v2_type_payload_present check (
    (assignment_type = 'questions' and question_ids is not null)
    or (assignment_type = 'lesson' and lesson_id is not null)
    or (assignment_type = 'practice_test'
        and (practice_test_id is not null or act_source_test is not null))
    or (assignment_type = 'lesson_pack' and lesson_pack_id is not null and question_ids is not null)
  );
