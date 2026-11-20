-- Complete the plan step and the lesson together. Legacy lesson tasks
-- without a pinned lesson can use a published lesson tagged to their skill.
create function public.complete_study_plan_lesson(p_task_id uuid, p_lesson_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student uuid := auth.uid();
  finished timestamptz := now();
begin
  if student is null or not exists (
    select 1 from public.lessons
    where id = p_lesson_id and status = 'published' and visibility = 'shared'
  ) then
    raise exception 'This lesson is unavailable.';
  end if;

  insert into public.lesson_progress as lp (lesson_id, student_id, completed_at, completed_blocks, check_answers)
  values (p_lesson_id, student, finished, '{}', '{}')
  on conflict (lesson_id, student_id) do update
    set completed_at = coalesce(lp.completed_at, excluded.completed_at);

  update public.plan_tasks pt
  set status = 'completed', completed_at = finished, completed_via = 'lesson:' || p_lesson_id::text
  from public.study_plans sp
  where pt.id = p_task_id
    and sp.id = pt.plan_id and sp.student_id = student and sp.status = 'active'
    and pt.status = 'pending' and pt.task_type = 'lesson'
    and pt.payload->>'assignment_id' is null
    and (
      pt.payload->>'lesson_id' = p_lesson_id::text
      or (
        pt.payload->>'lesson_id' is null and exists (
          select 1 from public.lesson_topics lt
          where lt.lesson_id = p_lesson_id and lt.skill_code = pt.payload->>'skill_code'
        )
      )
    );
end;
$$;

-- Serialize starts of the same plan step. A late second submit gets the
-- existing session and its saved position, including sessions created before this migration.
create function public.start_study_plan_practice(
  p_task_id uuid, p_question_ids uuid[], p_filter_criteria jsonb
)
returns table (session_id uuid, current_position integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student uuid := auth.uid();
  kind text;
begin
  if student is null then
    raise exception 'Sign in to continue.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_task_id::text, 0));
  select pt.task_type into kind
  from public.plan_tasks pt join public.study_plans sp on sp.id = pt.plan_id
  where pt.id = p_task_id
    and sp.student_id = student and sp.status = 'active' and sp.test_type = 'sat'
    and pt.status = 'pending' and pt.task_type in ('drill', 'practice_set', 'review')
    and pt.payload->>'assignment_id' is null
  for share of pt, sp;

  if not found then
    raise exception 'This practice task is unavailable.';
  end if;

  return query
  select ps.id, ps.current_position
  from public.practice_sessions ps
  where ps.plan_task_id = p_task_id and ps.user_id = student and ps.test_type = 'sat'
    and ps.status = 'in_progress' and ps.expires_at > now()
  order by ps.last_activity_at desc, ps.id
  limit 1;
  if found then return; end if;

  if coalesce(cardinality(p_question_ids), 0) = 0 or cardinality(p_question_ids) > 50 then
    raise exception 'Choose between 1 and 50 questions.';
  end if;

  return query
  insert into public.practice_sessions as ps
    (user_id, test_type, mode, question_ids, current_position, plan_task_id, filter_criteria)
  values (
    student, 'sat', case when kind = 'review' then 'review' else 'practice' end,
    to_jsonb(p_question_ids), 0, p_task_id,
    coalesce(p_filter_criteria, '{}'::jsonb)
      || jsonb_build_object('source', 'study_plan', 'plan_task_id', p_task_id)
  )
  returning ps.id, ps.current_position;
end;
$$;

-- A plan test and its first module are created in one transaction. An
-- in-progress attempt linked to the same task is reused.
create function public.start_study_plan_test(p_task_id uuid, p_test_id uuid, p_time_multiplier numeric)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student uuid := auth.uid();
  attempt_id uuid;
  first_module_id uuid;
begin
  if student is null then
    raise exception 'Sign in to continue.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(student::text, 1));
  perform pt.id
  from public.plan_tasks pt join public.study_plans sp on sp.id = pt.plan_id
  where pt.id = p_task_id
    and sp.student_id = student and sp.status = 'active' and sp.test_type = 'sat'
    and pt.status = 'pending' and pt.task_type = 'full_test'
    and pt.payload->>'assignment_id' is null
    and (pt.payload->>'practice_test_id' is null or pt.payload->>'practice_test_id' = p_test_id::text)
  for share of pt, sp;

  if not found then
    raise exception 'This test checkpoint is unavailable.';
  end if;

  select a.id into attempt_id from public.practice_test_attempts_v2 a
  where a.plan_task_id = p_task_id and a.user_id = student
    and a.status = 'in_progress' and a.sections_only is null
  order by a.started_at desc, a.id
  limit 1;
  if found then return attempt_id; end if;

  select m.id into first_module_id
  from public.practice_test_modules_v2 m
  join public.practice_tests_v2 t on t.id = m.practice_test_id
  where t.id = p_test_id and t.is_published and t.deleted_at is null
    and m.subject_code = 'RW' and m.module_number = 1 and m.route_code = 'std'
    and exists (
      select 1 from public.practice_test_modules_v2 math
      where math.practice_test_id = t.id and math.subject_code = 'MATH'
        and math.module_number = 1 and math.route_code = 'std'
    );

  if not found then
    raise exception 'Choose a test with Reading & Writing and Math.';
  end if;

  if exists (
    select 1 from public.practice_test_attempts_v2
    where user_id = student and status = 'in_progress'
  ) then
    raise exception 'Finish your in-progress test before starting this checkpoint.';
  end if;

  insert into public.practice_test_attempts_v2 (user_id, practice_test_id, status, source, time_multiplier, plan_task_id)
  values (student, p_test_id, 'in_progress', 'app', p_time_multiplier, p_task_id)
  returning id into attempt_id;

  insert into public.practice_test_module_attempts_v2 (practice_test_attempt_id, practice_test_module_id)
  values (attempt_id, first_module_id);

  return attempt_id;
end;
$$;

-- A full-length checkpoint is credited by the full attempt linked at
-- launch. A cleared or stale link cannot be attributed to another task.
create or replace function public.plan_task_from_test_attempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.plan_task_id is null or new.sections_only is not null then
    return new;
  end if;

  update public.plan_tasks pt
  set status = 'completed', completed_at = now(), completed_via = new.id::text
  from public.study_plans sp
  where pt.id = new.plan_task_id
    and sp.id = pt.plan_id and sp.student_id = new.user_id
    and sp.status = 'active' and sp.test_type = 'sat'
    and pt.status = 'pending' and pt.task_type = 'full_test'
    and pt.payload->>'assignment_id' is null
    and (pt.payload->>'practice_test_id' is null or pt.payload->>'practice_test_id' = new.practice_test_id::text);

  return new;
end;
$$;

revoke execute on function public.complete_study_plan_lesson(uuid, uuid) from public, anon;
revoke execute on function public.start_study_plan_practice(uuid, uuid[], jsonb) from public, anon;
revoke execute on function public.start_study_plan_test(uuid, uuid, numeric) from public, anon;
revoke execute on function public.plan_task_from_test_attempt() from public, anon, authenticated;

grant execute on function public.complete_study_plan_lesson(uuid, uuid) to authenticated;
grant execute on function public.start_study_plan_practice(uuid, uuid[], jsonb) to authenticated;
grant execute on function public.start_study_plan_test(uuid, uuid, numeric) to authenticated;
