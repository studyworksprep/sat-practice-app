-- =========================================================
-- Techniques (step D): section foundation syllabi
-- (docs/foundations-and-question-patterns.md §8.1 decision 6, §8.5 D)
-- =========================================================
--
-- Foundations are tool mechanics ("Desmos: regression", "the reading
-- passage strategy") taught once, before a section's first unit; unit
-- lessons are the applications. They live in one syllabus per section
-- — "Before Math", "Before Reading & Writing" — built in the same
-- editor as unit syllabi and stored in the same table, scoped to a
-- section instead of a unit. The generator walks a section's syllabus
-- before that section's first task and skips lessons already completed
-- (lesson_progress), so tutored students who did them live are never
-- re-assigned. A foundation's practice step is a mixed set across the
-- skills its lesson's techniques apply to (technique_skills).
--
-- Scope: exactly one of unit_id / section per row. test_type moves onto
-- the row so section syllabi can be filtered without a unit join (unit
-- rows are backfilled from their unit).

alter table public.curriculum_unit_steps
  alter column unit_id drop not null;

alter table public.curriculum_unit_steps
  add column if not exists section text
    check (section is null or section in ('math', 'reading_writing')),
  add column if not exists test_type text not null default 'sat';

update public.curriculum_unit_steps s
   set test_type = u.test_type
  from public.curriculum_units u
 where u.id = s.unit_id
   and s.test_type is distinct from u.test_type;

alter table public.curriculum_unit_steps
  add constraint curriculum_unit_steps_scope_check
  check ((unit_id is null) <> (section is null));

-- Positions are unique per syllabus: (unit_id, position) already covers
-- units; section syllabi get the same guarantee.
create unique index if not exists curriculum_unit_steps_section_position_idx
  on public.curriculum_unit_steps (test_type, section, position)
  where section is not null;

comment on column public.curriculum_unit_steps.section is
  'Section foundation syllabus this step belongs to (math | reading_writing), when unit_id is null. Walked before the section''s first task; lessons already completed are skipped.';
comment on column public.curriculum_unit_steps.test_type is
  'The test the syllabus is for. Unit rows mirror their unit; section rows need it because they have no unit.';
