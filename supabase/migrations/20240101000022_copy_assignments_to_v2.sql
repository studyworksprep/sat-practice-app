-- Phase 3 — copy v1 assignment content into assignments_v2.
--
-- One-shot migration. Re-runnable via ON CONFLICT (id) DO NOTHING —
-- v1 UUIDs are preserved into v2 so re-applying is a no-op.
--
-- Mapping rules:
--
--   question_assignments (v1) — two sub-cases:
--     a) rows where filter_criteria->>'type' = 'practice_test'
--        → assignments_v2.assignment_type = 'practice_test'
--          practice_test_id = (filter_criteria->>'practice_test_id')::uuid
--          question_ids is NULL (these rows had empty question_ids in v1
--          anyway — practice tests were jerry-rigged onto the questions
--          table by the original design).
--     b) all other rows
--        → assignments_v2.assignment_type = 'questions'
--          question_ids = v1.question_ids cast to uuid[]
--          filter_criteria preserved as-is.
--
--   lesson_assignments (v1)
--     → assignments_v2.assignment_type = 'lesson'
--       lesson_id preserved. (v1 had no title column — v2 title stays NULL.
--       The student UI can derive the display name from the lesson itself.)
--
--   question_assignment_students + lesson_assignment_students (v1)
--     → assignment_students_v2. completed_at is NULL across the board —
--       v1 never tracked per-student completion, and we're not going to
--       invent it. The parent's v1 completed_at (whole-assignment "done")
--       maps to archived_at on the v2 parent instead; that preserves the
--       teacher's "I'm done with this" intent without fabricating
--       per-student completion.
--
-- Pre-flight: if any v1 practice-test row has a filter_criteria->>'practice_test_id'
-- that is not present in practice_tests_v2, the migration aborts. This catches
-- schema drift between the v1 question_assignments jerry-rig and the v2
-- practice-test content copy (migration 000015).

do $$
declare
  missing_pt_count integer;
  missing_pt_sample text;
  bad_uuid_count integer;
begin
  -- ----------------------------------------------------------
  -- Pre-flight 1: every practice_test row's practice_test_id
  -- must resolve to a practice_tests_v2 row.
  -- ----------------------------------------------------------
  select
    count(*),
    string_agg(distinct qa.filter_criteria->>'practice_test_id', ', ')
  into missing_pt_count, missing_pt_sample
  from public.question_assignments qa
  where qa.filter_criteria->>'type' = 'practice_test'
    and not exists (
      select 1 from public.practice_tests_v2 ptv2
      where ptv2.id::text = qa.filter_criteria->>'practice_test_id'
    );

  if missing_pt_count > 0 then
    raise exception
      'question_assignments has % practice-test rows whose practice_test_id has no match in practice_tests_v2. Sample ids: %',
      missing_pt_count,
      coalesce(left(missing_pt_sample, 500), '(none)');
  end if;

  -- ----------------------------------------------------------
  -- Pre-flight 2: every element of question_ids on non-practice-test
  -- rows must be a well-formed UUID. v1 stored them as text[];
  -- a malformed value would explode the INSERT below.
  -- ----------------------------------------------------------
  select count(*)
  into bad_uuid_count
  from (
    select unnest(qa.question_ids) as qid
    from public.question_assignments qa
    where coalesce(qa.filter_criteria->>'type', '') <> 'practice_test'
  ) s
  where s.qid !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  if bad_uuid_count > 0 then
    raise exception
      'question_assignments.question_ids has % entries that are not valid UUIDs',
      bad_uuid_count;
  end if;

  -- ----------------------------------------------------------
  -- 1. question_assignments → assignments_v2
  --    Both sub-cases live in one INSERT with a CASE on the
  --    discriminator. filter_criteria is preserved for both
  --    (sections/type hints are still useful to the app).
  -- ----------------------------------------------------------
  insert into public.assignments_v2 (
    id,
    teacher_id,
    assignment_type,
    title,
    description,
    due_date,
    archived_at,
    question_ids,
    filter_criteria,
    practice_test_id,
    created_at
  )
  select
    qa.id,
    qa.teacher_id,
    case
      when qa.filter_criteria->>'type' = 'practice_test' then 'practice_test'
      else 'questions'
    end as assignment_type,
    qa.title,
    qa.description,
    qa.due_date,
    qa.completed_at as archived_at,   -- v1 parent completed_at → archived_at
    case
      when qa.filter_criteria->>'type' = 'practice_test' then null
      else qa.question_ids::uuid[]
    end as question_ids,
    qa.filter_criteria,
    case
      when qa.filter_criteria->>'type' = 'practice_test'
        then (qa.filter_criteria->>'practice_test_id')::uuid
      else null
    end as practice_test_id,
    qa.created_at
  from public.question_assignments qa
  on conflict (id) do nothing;

  -- ----------------------------------------------------------
  -- 2. lesson_assignments → assignments_v2
  --    No rows in v1 today, but the code path is ready if/when
  --    any appear before this migration runs.
  -- ----------------------------------------------------------
  insert into public.assignments_v2 (
    id,
    teacher_id,
    assignment_type,
    due_date,
    lesson_id,
    created_at
  )
  select
    la.id,
    la.teacher_id,
    'lesson',
    la.due_date,
    la.lesson_id,
    coalesce(la.created_at, now())
  from public.lesson_assignments la
  on conflict (id) do nothing;

  -- ----------------------------------------------------------
  -- 3. question_assignment_students → assignment_students_v2
  -- ----------------------------------------------------------
  insert into public.assignment_students_v2 (
    assignment_id,
    student_id,
    created_at
  )
  select
    qas.assignment_id,
    qas.student_id,
    coalesce(qas.created_at, now())
  from public.question_assignment_students qas
  on conflict (assignment_id, student_id) do nothing;

  -- ----------------------------------------------------------
  -- 4. lesson_assignment_students → assignment_students_v2
  -- ----------------------------------------------------------
  insert into public.assignment_students_v2 (
    assignment_id,
    student_id,
    created_at
  )
  select
    las.assignment_id,
    las.student_id,
    coalesce(las.created_at, now())
  from public.lesson_assignment_students las
  on conflict (assignment_id, student_id) do nothing;

end $$;
