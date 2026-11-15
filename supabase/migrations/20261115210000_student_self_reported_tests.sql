-- Students record their own test dates and official scores.
--
-- Until now only a tutor who can see the student could write
-- sat_test_registrations and sat_official_scores (20261114115428).
-- Students could read their rows but had no way to add a sitting they
-- registered for or a score they got back.
--
-- Students may now insert rows for themselves and delete the rows they
-- entered. They cannot touch a tutor-entered row, and nobody can UPDATE
-- (there is still no permissive UPDATE policy), so a row's author is
-- fixed at insert.
--
-- "Self-reported" is not a new column: it is created_by = student_id.
-- The insert policy pins created_by to the caller, so a student can
-- only ever write self-reported rows; tutor-entered rows always carry
-- the tutor's id (verified on prod 2026-11-15: 132 scores and 41
-- registrations, every one with created_by set and none equal to
-- student_id). App code treats self-reported scores as unverified and
-- leaves them out of tutor impact numbers and the LessonWorks sync
-- (lib/practice/official-tests.ts).
--
-- The CHECK and UNIQUE constraints below hold for every existing row
-- (same verification). They matter now because a student's own session
-- can write these tables directly through the database API, not only
-- through the app's validated actions.

-- ── Students: own rows only ───────────────────────────────────────

create policy sat_test_registrations_student_insert on public.sat_test_registrations
  for insert to authenticated
  with check (student_id = (select auth.uid()) and created_by = (select auth.uid()));

create policy sat_test_registrations_student_delete on public.sat_test_registrations
  for delete to authenticated
  using (student_id = (select auth.uid()) and created_by = (select auth.uid()));

create policy sat_official_scores_student_insert on public.sat_official_scores
  for insert to authenticated
  with check (student_id = (select auth.uid()) and created_by = (select auth.uid()));

create policy sat_official_scores_student_delete on public.sat_official_scores
  for delete to authenticated
  using (student_id = (select auth.uid()) and created_by = (select auth.uid()));

-- ── Data shape ────────────────────────────────────────────────────

-- Section scores: SAT 200-800, PSAT/NMSQT 160-760, both in steps of 10.
-- The per-type range is checked in the app; the database holds the
-- union.
alter table public.sat_official_scores
  add constraint sat_official_scores_rw_range
    check (rw_score between 160 and 800 and rw_score % 10 = 0),
  add constraint sat_official_scores_math_range
    check (math_score between 160 and 800 and math_score % 10 = 0),
  add constraint sat_official_scores_composite_sum
    check (composite_score = rw_score + math_score),
  add constraint sat_official_scores_test_type_check
    check (test_type in ('SAT', 'PSAT'));

-- One row per sitting. A tutor and a student entering the same test
-- would otherwise produce two rows that both count.
alter table public.sat_test_registrations
  add constraint sat_test_registrations_student_date_key unique (student_id, test_date);

alter table public.sat_official_scores
  add constraint sat_official_scores_student_sitting_key unique (student_id, test_date, test_type);

comment on column public.sat_test_registrations.created_by is
  'Who entered the row. Equal to student_id when the student added it themselves.';
comment on column public.sat_official_scores.created_by is
  'Who entered the row. Equal to student_id means self-reported: shown to tutors with a badge and left out of impact numbers and the LessonWorks sync.';
