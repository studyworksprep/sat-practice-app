-- Run against development. All fixture changes roll back, including drafts
-- archived by the builder. Teacher can edit student1, but not student2.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","app_metadata":{}}', true);
do $$
declare
  p uuid; copied uuid; blank uuid; a uuid; b uuid; done uuid;
  revision timestamptz;
  meta jsonb := jsonb_build_object('student_id', '33333333-3333-3333-3333-333333333333',
    'created_by', '22222222-2222-2222-2222-222222222222', 'test_type', 'sat',
    'goal_score', 1400, 'starting_score', 1000, 'test_date', current_date + 56, 'today', current_date,
    'mode', 'foundations', 'config', jsonb_build_object('weekly_hours', 5));
  denied boolean := false;
begin
  p := public.write_study_plan_draft(meta, '[]');
  insert into public.plan_tasks(plan_id, week_index, scheduled_date, task_type, payload, source)
    values (p, 0, current_date, 'lesson', '{"skill_code":"H.A.","plan_unit_key":"test-unit","generation_key":"remove-one"}', 'generated') returning id into a;
  insert into public.plan_tasks(plan_id, week_index, scheduled_date, task_type, payload, source)
    values (p, 0, current_date+1, 'drill', '{"skill_code":"H.A.","plan_unit_key":"test-unit","generation_key":"move-one"}', 'generated') returning id into b;
  insert into public.plan_tasks(plan_id, week_index, scheduled_date, task_type, payload, source, status)
    values (p, 0, current_date, 'drill', '{"skill_code":"H.B.","generation_key":"completed"}', 'generated', 'completed') returning id into done;

  perform public.edit_study_plan(p, jsonb_build_object('operation','remove','task_ids',jsonb_build_array(a)));
  if not ((select config->'editor'->'excluded_tasks' from public.study_plans where id=p) ? 'remove-one') then raise exception 'Removal was not recorded'; end if;
  perform public.edit_study_plan(p, jsonb_build_object('operation','move','whole_unit',true,'task_ids',jsonb_build_array(b),'week_index',2));
  if not exists (select 1 from public.plan_tasks where id=b and week_index=2 and source='tutor' and scheduled_date=current_date+15) then raise exception 'Unit move lost timing/source'; end if;
  select updated_at into revision from public.study_plans where id=p;
  perform public.edit_study_plan(p, jsonb_build_object('operation','replace','expected_updated_at',revision,'tasks',jsonb_build_array(
    jsonb_build_object('week_index',0,'scheduled_date',current_date,'task_type','lesson','payload',jsonb_build_object('generation_key','remove-one')),
    jsonb_build_object('week_index',0,'scheduled_date',current_date,'task_type','drill','payload',jsonb_build_object('generation_key','move-one')),
    jsonb_build_object('week_index',0,'scheduled_date',current_date,'task_type','drill','payload',jsonb_build_object('generation_key','completed')))));
  if (select count(*) from public.plan_tasks where plan_id=p) <> 2 then raise exception 'Regeneration restored removed, moved, or completed work'; end if;

  begin
    perform public.edit_study_plan(p, jsonb_build_object('operation','remove','task_ids',jsonb_build_array(done)));
    raise exception 'Completed task edit was accepted';
  exception when others then
    if sqlerrm = 'Completed task edit was accepted' then raise; end if;
  end;
  begin
    perform public.edit_study_plan(p, jsonb_build_object('operation','replace','expected_updated_at','2000-01-01','tasks','[]'::jsonb));
    raise exception 'Stale replacement was accepted';
  exception when others then
    if sqlerrm = 'Stale replacement was accepted' then raise; end if;
  end;

  perform public.edit_study_plan(p, jsonb_build_object('operation','remove','task_ids',jsonb_build_array(b),'excluded_skills',jsonb_build_array('H.A.')));
  select updated_at into revision from public.study_plans where id=p;
  perform public.edit_study_plan(p, jsonb_build_object('operation','replace','expected_updated_at',revision,'tasks',jsonb_build_array(
    jsonb_build_object('week_index',0,'scheduled_date',current_date,'task_type','drill','payload',jsonb_build_object('skill_code','H.A.','generation_key','new-occurrence')))));
  if (select count(*) from public.plan_tasks where plan_id=p) <> 1 then raise exception 'Removed unit was regenerated'; end if;

  -- A replacement draft retains completion history and exclusions.
  update public.study_plans set status='archived' where student_id='33333333-3333-3333-3333-333333333333' and status='active';
  update public.study_plans set status='active' where id=p;
  select updated_at into revision from public.study_plans where id=p;
  copied := public.write_study_plan_draft(meta, '[]', p, false, revision);
  if not exists (select 1 from public.plan_tasks where plan_id=copied and status='completed') then raise exception 'Draft copy lost history'; end if;
  if not ((select config->'editor'->'excluded_skills' from public.study_plans where id=copied) ? 'H.A.') then raise exception 'Draft copy lost unit exclusions'; end if;

  blank := public.write_study_plan_draft(meta, '[]', null, true);
  if not (select (config->'editor'->>'manual')::boolean from public.study_plans where id=blank) then raise exception 'Blank plan is not manual'; end if;
  select updated_at into revision from public.study_plans where id=blank;
  if public.edit_study_plan(blank, jsonb_build_object('operation','replace','expected_updated_at',revision,'tasks',jsonb_build_array(
    jsonb_build_object('week_index',0,'scheduled_date',current_date,'task_type','drill','payload','{}'::jsonb)))) <> 0 then raise exception 'Blank plan was filled automatically'; end if;

  begin
    perform public.write_study_plan_draft(meta || '{"student_id":"44444444-4444-4444-4444-444444444444"}', '[]');
  exception when others then denied := true;
  end;
  if not denied then raise exception 'Teacher was allowed to write outside roster'; end if;
  if has_function_privilege('anon', 'public.edit_study_plan(uuid,jsonb)', 'execute') then raise exception 'Anonymous edit function access'; end if;
end;
$$;
rollback;
select 'Modular editor: atomic edits, exclusions, history, manual plans, and authorization passed' as result;
