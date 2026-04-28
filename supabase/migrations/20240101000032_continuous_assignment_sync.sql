-- Continuous v1 → v2 assignment sync.
--
-- 20240101000022_copy_assignments_to_v2.sql was a one-shot bulk
-- backfill. Anything created in question_assignments,
-- lesson_assignments, or their student-junction tables AFTER
-- that migration ran never reached assignments_v2 /
-- assignment_students_v2. For students flipped to ui_version='next',
-- that means assignments their tutor created in the legacy UI
-- silently disappear.
--
-- This migration adds AFTER INSERT / UPDATE / DELETE triggers on
-- the four v1 tables that mirror every change into the v2
-- counterparts in real time. The triggers preserve the same
-- shape rules as the original backfill:
--
--   question_assignments → assignments_v2
--     - filter_criteria.type='practice_test'  → assignment_type='practice_test'
--     - everything else                       → assignment_type='questions'
--     - completed_at on the v1 parent maps to v2 archived_at
--   lesson_assignments → assignments_v2
--     - assignment_type='lesson', lesson_id preserved
--   *_assignment_students → assignment_students_v2
--     - student_id, assignment_id, created_at preserved
--
-- DELETE on a v1 row soft-deletes the v2 mirror via
-- assignments_v2.deleted_at = now() instead of hard-removing,
-- so any in-flight UI on the new tree degrades gracefully
-- (the row is filtered out by `is null` checks at every
-- assignment-list query) and a re-INSERT of the same uuid
-- resurrects it cleanly.
--
-- Triggers run as SECURITY DEFINER so they bypass RLS — the
-- v1 INSERT / UPDATE / DELETE has already passed RLS at the
-- caller's level; the v2 mirror should follow blindly.

-- ──────────────────────────────────────────────────────────────
-- 1. question_assignments → assignments_v2
-- ──────────────────────────────────────────────────────────────

create or replace function public.sync_question_assignment_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_practice_test boolean;
  v_practice_test_id uuid;
begin
  if (TG_OP = 'DELETE') then
    update public.assignments_v2
    set deleted_at = now()
    where id = OLD.id and deleted_at is null;
    return OLD;
  end if;

  v_is_practice_test := (NEW.filter_criteria->>'type' = 'practice_test');
  if v_is_practice_test then
    -- Defensive cast — if the v1 row was malformed somehow,
    -- prefer to skip over crashing the v1 INSERT. The original
    -- backfill aborted on missing practice_tests_v2 rows; here
    -- we soften that to a NULL practice_test_id since blocking
    -- the legacy write would be more disruptive than a stub
    -- v2 row.
    begin
      v_practice_test_id := (NEW.filter_criteria->>'practice_test_id')::uuid;
    exception when others then
      v_practice_test_id := null;
    end;
  else
    v_practice_test_id := null;
  end if;

  insert into public.assignments_v2 (
    id, teacher_id, assignment_type, title, description,
    due_date, archived_at, question_ids, filter_criteria,
    practice_test_id, created_at
  )
  values (
    NEW.id,
    NEW.teacher_id,
    case when v_is_practice_test then 'practice_test' else 'questions' end,
    NEW.title,
    NEW.description,
    NEW.due_date,
    NEW.completed_at,
    case when v_is_practice_test then null
         else nullif(NEW.question_ids, '{}')::uuid[]
    end,
    NEW.filter_criteria,
    v_practice_test_id,
    NEW.created_at
  )
  on conflict (id) do update set
    teacher_id = excluded.teacher_id,
    assignment_type = excluded.assignment_type,
    title = excluded.title,
    description = excluded.description,
    due_date = excluded.due_date,
    archived_at = excluded.archived_at,
    question_ids = excluded.question_ids,
    filter_criteria = excluded.filter_criteria,
    practice_test_id = excluded.practice_test_id,
    deleted_at = null;  -- resurrect on UPDATE

  return NEW;
end;
$$;

drop trigger if exists trg_question_assignment_v2_sync
  on public.question_assignments;
create trigger trg_question_assignment_v2_sync
  after insert or update or delete on public.question_assignments
  for each row execute function public.sync_question_assignment_to_v2();

-- ──────────────────────────────────────────────────────────────
-- 2. lesson_assignments → assignments_v2
-- ──────────────────────────────────────────────────────────────

create or replace function public.sync_lesson_assignment_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'DELETE') then
    update public.assignments_v2
    set deleted_at = now()
    where id = OLD.id and deleted_at is null;
    return OLD;
  end if;

  insert into public.assignments_v2 (
    id, teacher_id, assignment_type, due_date, lesson_id, created_at
  )
  values (
    NEW.id,
    NEW.teacher_id,
    'lesson',
    NEW.due_date,
    NEW.lesson_id,
    coalesce(NEW.created_at, now())
  )
  on conflict (id) do update set
    teacher_id = excluded.teacher_id,
    assignment_type = excluded.assignment_type,
    due_date = excluded.due_date,
    lesson_id = excluded.lesson_id,
    deleted_at = null;

  return NEW;
end;
$$;

drop trigger if exists trg_lesson_assignment_v2_sync
  on public.lesson_assignments;
create trigger trg_lesson_assignment_v2_sync
  after insert or update or delete on public.lesson_assignments
  for each row execute function public.sync_lesson_assignment_to_v2();

-- ──────────────────────────────────────────────────────────────
-- 3. question_assignment_students → assignment_students_v2
-- ──────────────────────────────────────────────────────────────

create or replace function public.sync_qas_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'DELETE') then
    delete from public.assignment_students_v2
    where assignment_id = OLD.assignment_id
      and student_id = OLD.student_id;
    return OLD;
  end if;

  insert into public.assignment_students_v2 (
    assignment_id, student_id, created_at
  )
  values (
    NEW.assignment_id,
    NEW.student_id,
    coalesce(NEW.created_at, now())
  )
  on conflict (assignment_id, student_id) do nothing;

  return NEW;
end;
$$;

drop trigger if exists trg_qas_v2_sync
  on public.question_assignment_students;
create trigger trg_qas_v2_sync
  after insert or update or delete on public.question_assignment_students
  for each row execute function public.sync_qas_to_v2();

-- ──────────────────────────────────────────────────────────────
-- 4. lesson_assignment_students → assignment_students_v2
-- ──────────────────────────────────────────────────────────────

create or replace function public.sync_las_to_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (TG_OP = 'DELETE') then
    delete from public.assignment_students_v2
    where assignment_id = OLD.assignment_id
      and student_id = OLD.student_id;
    return OLD;
  end if;

  insert into public.assignment_students_v2 (
    assignment_id, student_id, created_at
  )
  values (
    NEW.assignment_id,
    NEW.student_id,
    coalesce(NEW.created_at, now())
  )
  on conflict (assignment_id, student_id) do nothing;

  return NEW;
end;
$$;

drop trigger if exists trg_las_v2_sync
  on public.lesson_assignment_students;
create trigger trg_las_v2_sync
  after insert or update or delete on public.lesson_assignment_students
  for each row execute function public.sync_las_to_v2();

-- ──────────────────────────────────────────────────────────────
-- 5. Catch-up backfill for any rows that landed between the
--    20240101000022 one-shot and this migration.
--    Same INSERT...SELECT shape as the original; ON CONFLICT
--    DO NOTHING so it's a no-op on the rows the original copy
--    already created.
-- ──────────────────────────────────────────────────────────────

do $$
begin
  insert into public.assignments_v2 (
    id, teacher_id, assignment_type, title, description,
    due_date, archived_at, question_ids, filter_criteria,
    practice_test_id, created_at
  )
  select
    qa.id,
    qa.teacher_id,
    case when qa.filter_criteria->>'type' = 'practice_test'
         then 'practice_test'
         else 'questions'
    end,
    qa.title,
    qa.description,
    qa.due_date,
    qa.completed_at,
    case when qa.filter_criteria->>'type' = 'practice_test' then null
         else nullif(qa.question_ids, '{}')::uuid[]
    end,
    qa.filter_criteria,
    case when qa.filter_criteria->>'type' = 'practice_test'
         then nullif(qa.filter_criteria->>'practice_test_id', '')::uuid
         else null
    end,
    qa.created_at
  from public.question_assignments qa
  on conflict (id) do nothing;

  insert into public.assignments_v2 (
    id, teacher_id, assignment_type, due_date, lesson_id, created_at
  )
  select
    la.id, la.teacher_id, 'lesson', la.due_date, la.lesson_id,
    coalesce(la.created_at, now())
  from public.lesson_assignments la
  on conflict (id) do nothing;

  insert into public.assignment_students_v2 (
    assignment_id, student_id, created_at
  )
  select qas.assignment_id, qas.student_id, coalesce(qas.created_at, now())
  from public.question_assignment_students qas
  on conflict (assignment_id, student_id) do nothing;

  insert into public.assignment_students_v2 (
    assignment_id, student_id, created_at
  )
  select las.assignment_id, las.student_id, coalesce(las.created_at, now())
  from public.lesson_assignment_students las
  on conflict (assignment_id, student_id) do nothing;
end $$;
