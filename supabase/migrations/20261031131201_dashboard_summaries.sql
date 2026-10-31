-- Compact, caller-scoped dashboard reads. No SECURITY DEFINER: the same
-- attempts/question/enrollment policies as the previous REST reads apply.
-- Apply through MCP; this directory is not a replayable migration chain.

create or replace function public.get_act_student_dashboard_stats(
  p_user_id uuid,
  p_week_ago timestamptz,
  p_lookback_start timestamptz
)
returns table (
  total_attempts bigint,
  correct_attempts bigint,
  week_attempts bigint,
  per_section jsonb
)
language sql stable security invoker set search_path = ''
as $$
  with attempt_rows as materialized (
    select a.id, a.question_id, a.is_correct, a.created_at
    from public.act_attempts a
    where a.user_id = p_user_id and (select auth.uid()) is not null
  ), totals as (
    select count(*) as total_attempts,
      count(*) filter (where is_correct) as correct_attempts,
      count(*) filter (where created_at >= p_week_ago) as week_attempts
    from attempt_rows
  ), first_attempts as (
    -- First answer per question in the 90-day window, not the latest
    -- retry. Unlike the REST slice, this cannot truncate at max-rows.
    select distinct on (question_id) question_id, is_correct
    from attempt_rows
    where created_at >= p_lookback_start
    order by question_id, created_at, id
  ), categories as (
    select coalesce(q.section, 'unknown') as section,
      coalesce(q.category, 'Other') as name, min(q.category_code) as code,
      count(*) as total, count(*) filter (where a.is_correct) as correct
    from first_attempts a
    join public.act_questions q on q.id = a.question_id
    group by coalesce(q.section, 'unknown'), coalesce(q.category, 'Other')
  ), sections as (
    select section, sum(total) as total, sum(correct) as correct,
      jsonb_agg(jsonb_build_object('code', code, 'name', name,
        'correct', correct, 'total', total)
        order by correct::numeric / nullif(total, 0), name) as categories
    from categories group by section
  )
  select t.total_attempts, t.correct_attempts, t.week_attempts,
    coalesce((select jsonb_agg(jsonb_build_object('section', section,
      'correct', correct, 'total', total, 'categories', categories)
      order by case section when 'english' then 0 when 'math' then 1
        when 'reading' then 2 when 'science' then 3 else 99 end, section)
      from sections), '[]'::jsonb)
  from totals t;
$$;

revoke all on function public.get_act_student_dashboard_stats(uuid, timestamptz, timestamptz)
  from public, anon, service_role;
grant execute on function public.get_act_student_dashboard_stats(uuid, timestamptz, timestamptz)
  to authenticated;

create or replace function public.get_dashboard_recent_accuracy(
  p_user_id uuid,
  p_session_ids uuid[],
  p_assignment_ids uuid[]
)
returns table (kind text, id uuid, attempted bigint, correct bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  -- The page displays at most ten sessions per test type and ten
  -- completed assignments. Bound work even for direct API callers.
  if coalesce(cardinality(p_session_ids), 0) > 20
     or coalesce(cardinality(p_assignment_ids), 0) > 10 then
    raise exception 'Too many dashboard items' using errcode = '22023';
  end if;

  return query
  with groups as (
    select case s.test_type when 'act' then 'act_session' else 'session' end as kind,
      s.id, s.test_type, s.created_at as since,
      s.question_ids
    from public.practice_sessions s
    where p_user_id = (select auth.uid()) and s.user_id = p_user_id
      and s.id = any(p_session_ids) and s.status = 'completed'
      and s.mode in ('practice', 'review') and s.test_type in ('sat', 'act')
      and coalesce(s.filter_criteria->>'assignment_id', '') = ''
      and coalesce(s.filter_criteria->>'kind', '') <> 'practice_test'
    union all
    select 'assignment', a.id, 'sat', '-infinity'::timestamptz,
      to_jsonb(a.question_ids)
    from public.assignments_v2 a
    join public.assignment_students_v2 e on e.assignment_id = a.id
    where p_user_id = (select auth.uid()) and e.student_id = p_user_id
      and a.id = any(p_assignment_ids) and e.completed_at is not null
      and a.assignment_type in ('questions', 'lesson_pack')
      and a.archived_at is null and a.deleted_at is null
  ), questions as (
    select distinct g.kind, g.id, g.test_type, g.since, q.question_id::uuid
    from groups g
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(g.question_ids) = 'array'
        then g.question_ids else '[]'::jsonb end
    ) q(question_id)
  ), answers as (
    select q.kind, q.id, latest.id as attempt_id, latest.is_correct
    from questions q
    left join lateral (
      select a.id, a.is_correct from public.attempts a
      where a.user_id = p_user_id and a.question_id = q.question_id
        and a.created_at >= q.since
      order by a.created_at desc, a.id desc limit 1
    ) latest on true
    where q.test_type = 'sat'
    union all
    select q.kind, q.id, latest.id, latest.is_correct
    from questions q
    left join lateral (
      select a.id, a.is_correct from public.act_attempts a
      where a.user_id = p_user_id and a.question_id = q.question_id
        and a.created_at >= q.since
      order by a.created_at desc, a.id desc limit 1
    ) latest on true
    where q.test_type = 'act'
  )
  -- Preserve the cards' existing latest-answer semantics. They formerly
  -- picked the first match from a descending, globally capped history.
  select a.kind, a.id, count(a.attempt_id), count(*) filter (where a.is_correct)
  from answers a group by a.kind, a.id;
end;
$$;

revoke all on function public.get_dashboard_recent_accuracy(uuid, uuid[], uuid[])
  from public, anon, service_role;
grant execute on function public.get_dashboard_recent_accuracy(uuid, uuid[], uuid[])
  to authenticated;

comment on function public.get_act_student_dashboard_stats(uuid, timestamptz, timestamptz)
  is 'RLS-scoped ACT totals and first-attempt category accuracy for student/tutor dashboards.';
comment on function public.get_dashboard_recent_accuracy(uuid, uuid[], uuid[])
  is 'Own-student latest-answer accuracy for up to 20 completed sessions and 10 completed assignments.';
