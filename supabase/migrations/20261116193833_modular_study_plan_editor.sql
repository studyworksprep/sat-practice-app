-- Living plan editor: unit grouping and stable task identities are stored
-- in payload; exclusion records and the original grid live in config.
-- All edits/replacements lock the parent plan and commit atomically.

with keyed as (
  select id, 'w' || week_index || ':' || task_type || ':' || coalesce(payload->>'skill_code', '') || ':' ||
    coalesce(payload->>'unit_step_id', payload->>'lesson_id', '') || ':' || coalesce(payload->>'drill_role', '') || ':' ||
    row_number() over (partition by plan_id, week_index, task_type, payload->>'skill_code',
      coalesce(payload->>'unit_step_id', payload->>'lesson_id', ''), payload->>'drill_role'
      order by scheduled_date nulls first, created_at, id) as task_key
  from public.plan_tasks where source = 'generated'
)
update public.plan_tasks t set payload = t.payload || jsonb_build_object('generation_key', k.task_key)
from keyed k where k.id = t.id and not (t.payload ? 'generation_key');

update public.study_plans p set config = p.config || jsonb_build_object('plan_start',
  coalesce((select min(scheduled_date) from public.plan_tasks t where t.plan_id = p.id), p.created_at::date))
where not (p.config ? 'plan_start');

create or replace function public.edit_study_plan(p_plan_id uuid, p_edit jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  p public.study_plans%rowtype;
  op text := p_edit->>'operation';
  ids uuid[] := array(select jsonb_array_elements_text(coalesce(p_edit->'task_ids', '[]'))::uuid);
  editor jsonb;
  anchor date;
  first_week integer;
  target_week integer;
  affected integer := 0;
  r jsonb;
  src text;
  keys jsonb;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then raise exception 'Not authenticated'; end if;
  if coalesce((auth.jwt()->'app_metadata'->>'is_demo')::boolean, false) then raise exception 'Demo accounts are read-only'; end if;
  select * into p from public.study_plans where id = p_plan_id and status in ('draft', 'active') for update;
  if not found then raise exception 'Plan not found or not accessible'; end if;
  if p_edit ? 'expected_updated_at' and (p_edit->>'expected_updated_at')::timestamptz is distinct from p.updated_at then
    raise exception 'This plan changed while it was being rebuilt. Refresh and try again.';
  end if;
  src := case when auth.uid() = p.student_id then 'student' else 'tutor' end;
  editor := coalesce(p.config->'editor', '{}'::jsonb);
  anchor := coalesce((p.config->>'plan_start')::date,
    (select min(scheduled_date) from public.plan_tasks where plan_id = p.id), p.created_at::date);

  if op in ('move', 'remove', 'update') then
    if cardinality(ids) = 0 or cardinality(ids) <> (select count(*) from public.plan_tasks where plan_id = p.id and id = any(ids) and status = 'pending') then
      raise exception 'Only open tasks in this plan can be edited. Refresh and try again.';
    end if;
  end if;

  if op = 'move' then
    target_week := (p_edit->>'week_index')::integer;
    select min(week_index) into first_week from public.plan_tasks where id = any(ids) and plan_id = p.id;
    if target_week is null or target_week < 0 or target_week > 51 or exists (
      select 1 from public.plan_tasks where id = any(ids) and
        (week_index + target_week - first_week > 51 or
         anchor + (coalesce(scheduled_date, anchor + week_index * 7) - anchor) + (target_week - first_week) * 7 > p.test_date)
    ) then raise exception 'This move would put work beyond the test date. Choose an earlier week.'; end if;
    update public.plan_tasks set
      week_index = week_index + target_week - first_week,
      scheduled_date = coalesce(scheduled_date, anchor + week_index * 7) + (target_week - first_week) * 7,
      source = src,
      payload = payload || case when coalesce((p_edit->>'whole_unit')::boolean, false)
        then jsonb_build_object('editor_unit', true) else '{}'::jsonb end
    where plan_id = p.id and id = any(ids) and status = 'pending';
    get diagnostics affected = row_count;
  elsif op = 'remove' or op = 'update' then
    select coalesce(jsonb_agg(payload->>'generation_key') filter (where payload ? 'generation_key'), '[]')
      into keys from public.plan_tasks where plan_id = p.id and id = any(ids);
    editor := editor || jsonb_build_object('excluded_tasks',
      (select coalesce(jsonb_agg(distinct value), '[]') from jsonb_array_elements(coalesce(editor->'excluded_tasks', '[]') || keys)));
    editor := editor || jsonb_build_object('excluded_skills',
      (select coalesce(jsonb_agg(distinct value), '[]') from jsonb_array_elements(
        coalesce(editor->'excluded_skills', '[]') || coalesce(p_edit->'excluded_skills', '[]'))));
    if op = 'remove' then
      delete from public.plan_tasks where plan_id = p.id and id = any(ids) and status = 'pending';
      get diagnostics affected = row_count;
    else
      if cardinality(ids) <> 1 then raise exception 'Choose one task to update'; end if;
      update public.plan_tasks set payload = p_edit->'payload', source = src where id = ids[1] and plan_id = p.id;
      affected := 1;
    end if;
  elsif op = 'add' then
    -- Explicitly adding a unit/skill restores it after an earlier removal.
    editor := editor || jsonb_build_object('excluded_skills',
      (select coalesce(jsonb_agg(value), '[]') from jsonb_array_elements(coalesce(editor->'excluded_skills', '[]'))
       where not (coalesce(p_edit->'restore_skills', '[]') @> jsonb_build_array(value))));
    for r in select * from jsonb_array_elements(p_edit->'tasks') loop
      if (r->>'week_index')::integer not between 0 and 51 or (r->>'scheduled_date')::date > p.test_date then
        raise exception 'Choose a week before the test date';
      end if;
      insert into public.plan_tasks (plan_id, week_index, scheduled_date, task_type, payload, source)
        values (p.id, (r->>'week_index')::integer, (r->>'scheduled_date')::date, r->>'task_type', r->'payload', src);
      affected := affected + 1;
    end loop;
  elsif op = 'replace' then
    if not (p_edit ? 'expected_updated_at') then raise exception 'A plan revision is required'; end if;
    if coalesce((editor->>'manual')::boolean, false) then return 0; end if;
    delete from public.plan_tasks where plan_id = p.id and source = 'generated' and status = 'pending'
      and (not (p_edit ? 'week_index') or week_index = (p_edit->>'week_index')::integer)
      and (scheduled_date is null or scheduled_date >= coalesce((p_edit->>'from_date')::date, '-infinity'::date));
    for r in select * from jsonb_array_elements(p_edit->'tasks') loop
      if coalesce(editor->'excluded_skills', '[]') ? (r->'payload'->>'skill_code') then continue; end if;
      if coalesce(editor->'excluded_tasks', '[]') ? (r->'payload'->>'generation_key') then continue; end if;
      if exists (select 1 from public.plan_tasks t where t.plan_id = p.id and
        (t.source <> 'generated' or t.status <> 'pending') and t.payload->>'generation_key' = r->'payload'->>'generation_key') then continue; end if;
      insert into public.plan_tasks (plan_id, week_index, scheduled_date, task_type, payload, source)
        values (p.id, (r->>'week_index')::integer, (r->>'scheduled_date')::date, r->>'task_type', r->'payload', 'generated');
      affected := affected + 1;
    end loop;
  else raise exception 'Unknown plan edit';
  end if;
  update public.study_plans set config = config || jsonb_build_object('editor', editor, 'plan_start', anchor) where id = p.id;
  return affected;
end;
$$;
revoke all on function public.edit_study_plan(uuid, jsonb) from public, anon;
grant execute on function public.edit_study_plan(uuid, jsonb) to authenticated, service_role;

create or replace function public.write_study_plan_draft(
  p_meta jsonb, p_tasks jsonb, p_source_plan_id uuid default null,
  p_empty boolean default false, p_expected_updated_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  original public.study_plans%rowtype;
  draft_id uuid;
  settings jsonb;
  r jsonb;
  student uuid := (p_meta->>'student_id')::uuid;
  exam text := p_meta->>'test_type';
  anchor date;
begin
  if auth.uid() is null and current_user not in ('service_role', 'postgres') then raise exception 'Not authenticated'; end if;
  if coalesce((auth.jwt()->'app_metadata'->>'is_demo')::boolean, false) then raise exception 'Demo accounts are read-only'; end if;
  if current_user not in ('service_role', 'postgres') and not public.can_view(student) then raise exception 'Student not accessible'; end if;
  perform pg_advisory_xact_lock(hashtextextended(student::text || ':' || exam, 0));
  if p_source_plan_id is not null and not p_empty then
    select * into original from public.study_plans where id = p_source_plan_id and student_id = student and test_type = exam
      and status in ('draft', 'active') for update;
    if not found then raise exception 'Source plan not found or not accessible'; end if;
    if p_expected_updated_at is null or p_expected_updated_at is distinct from original.updated_at then
      raise exception 'This plan changed while it was being rebuilt. Refresh and try again.';
    end if;
  end if;
  anchor := coalesce((original.config->>'plan_start')::date,
    (select min(scheduled_date) from public.plan_tasks where plan_id = original.id),
    (p_meta->>'today')::date, current_date);
  settings := coalesce(original.config, '{}') || coalesce(p_meta->'config', '{}') || jsonb_build_object('plan_start', anchor);
  if p_empty then settings := settings || jsonb_build_object('editor', jsonb_build_object('manual', true)); end if;
  if original.status = 'draft' then
    draft_id := original.id;
  else
    update public.study_plans set status = 'archived' where student_id = student and test_type = exam and status = 'draft';
    insert into public.study_plans (student_id, created_by, test_type, config) values
      (student, (p_meta->>'created_by')::uuid, exam, settings) returning id into draft_id;
    if original.id is not null then
      insert into public.plan_tasks (plan_id, week_index, scheduled_date, task_type, payload, source, status, completed_at, completed_via)
        select draft_id, week_index, scheduled_date, task_type, payload, source, status, completed_at, completed_via
        from public.plan_tasks where plan_id = original.id;
    end if;
  end if;
  update public.study_plans set goal_score = (p_meta->>'goal_score')::integer,
    starting_score = (p_meta->>'starting_score')::integer, test_date = (p_meta->>'test_date')::date,
    mode = p_meta->>'mode', prep_level = p_meta->>'prep_level', intent = p_meta->>'intent',
    rationale = p_meta->>'rationale', phases = coalesce(p_meta->'phases', '[]'), config = settings,
    created_by = (p_meta->>'created_by')::uuid where id = draft_id;
  if not coalesce((settings->'editor'->>'manual')::boolean, false) then
    select * into original from public.study_plans where id = draft_id;
    perform public.edit_study_plan(draft_id, jsonb_build_object('operation', 'replace', 'tasks', p_tasks,
      'from_date', p_meta->>'today', 'expected_updated_at', original.updated_at));
  end if;
  return draft_id;
end;
$$;
revoke all on function public.write_study_plan_draft(jsonb, jsonb, uuid, boolean, timestamptz) from public, anon;
grant execute on function public.write_study_plan_draft(jsonb, jsonb, uuid, boolean, timestamptz) to authenticated, service_role;
