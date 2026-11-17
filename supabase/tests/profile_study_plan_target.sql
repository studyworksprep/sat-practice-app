-- Development only. Every fixture and profile edit rolls back.
begin;
update public.study_plans set status = 'archived'
 where student_id in ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')
   and status in ('active', 'draft');
update public.profiles set target_sat_score = 1200
 where id = '33333333-3333-3333-3333-333333333333';

create temporary table target_sync_fixtures(kind text primary key, id uuid not null) on commit drop;
do $$
declare
  f record;
  plan uuid;
begin
  for f in select * from (values
    ('active', 'sat', 'active', 1200, '33333333-3333-3333-3333-333333333333'::uuid, false),
    ('draft', 'sat', 'draft', 1200, '33333333-3333-3333-3333-333333333333'::uuid, true),
    ('archived', 'sat', 'archived', 1100, '33333333-3333-3333-3333-333333333333'::uuid, false),
    ('completed', 'sat', 'completed', 1000, '33333333-3333-3333-3333-333333333333'::uuid, false),
    ('act', 'act', 'active', 30, '33333333-3333-3333-3333-333333333333'::uuid, false),
    ('other_student', 'sat', 'active', 1300, '44444444-4444-4444-4444-444444444444'::uuid, false)
  ) as v(kind, exam, status, goal, student, manual) loop
    insert into public.study_plans(student_id, created_by, test_type, goal_score, starting_score,
      test_date, status, config, mode, rationale, phases, updated_at)
    values (f.student, '22222222-2222-2222-2222-222222222222', f.exam, f.goal, 1000,
      current_date + 56, f.status,
      jsonb_build_object('plan_start', current_date, 'weekly_hours', 5,
        'editor', jsonb_build_object('manual', f.manual, 'excluded_tasks', jsonb_build_array('removed'),
          'excluded_skills', jsonb_build_array('H.B.'))),
      'foundations', '8-week plan from 1000 toward 1200. Tutor notes stay.',
      '[{"type":"coverage","start_week":0,"end_week":5}]', '2000-01-01') returning id into plan;
    insert into target_sync_fixtures values (f.kind, plan);
    if f.kind in ('active', 'draft') then
      insert into public.plan_tasks(plan_id, week_index, scheduled_date, task_type, payload, source, status)
      values (plan, 2, current_date + 15, 'drill', '{"title":"Tutor moved","plan_unit_key":"kept-unit","schedule_order":4}', 'tutor', 'pending'),
        (plan, 0, current_date, 'lesson', '{"title":"Finished lesson"}', 'generated', 'completed'),
        (plan, 1, current_date + 8, 'practice_set', '{"title":"Student added"}', 'student', 'pending');
    end if;
  end loop;
end;
$$;

create temporary table target_sync_plan_before as
select p.id, to_jsonb(p) - 'goal_score' - 'updated_at' as preserved,
  p.goal_score, p.updated_at as prior_revision, f.kind
from public.study_plans p join target_sync_fixtures f on f.id = p.id;
create temporary table target_sync_tasks_before as
select id, to_jsonb(t) as preserved from public.plan_tasks t;
grant select on target_sync_fixtures, target_sync_plan_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{}}', true);
do $$
declare
  before_positions jsonb;
  after_positions jsonb;
  affected integer;
  stale_denied boolean := false;
begin
  update public.profiles set target_sat_score = 1460 where id = auth.uid();
  if (select count(*) from public.study_plans p join target_sync_fixtures f on f.id=p.id
      where f.kind in ('active','draft') and p.goal_score=1460) <> 2 then
    raise exception 'Student profile edit did not update active and manual draft goals';
  end if;
  if exists (select 1 from public.study_plans p join target_sync_plan_before b on b.id=p.id
    where (to_jsonb(p)-'goal_score'-'updated_at') is distinct from b.preserved) then
    raise exception 'Profile target edit changed plan metadata or tutor preferences';
  end if;
  begin
    perform public.edit_study_plan((select id from target_sync_fixtures where kind='active'),
      jsonb_build_object('operation','replace','from_date',current_date,'expected_updated_at',
        (select prior_revision from target_sync_plan_before where kind='active'),'tasks','[]'::jsonb));
  exception when others then
    if sqlerrm <> 'This plan changed while it was being rebuilt. Refresh and try again.' then raise; end if;
    stale_denied := true;
  end;
  if not stale_denied then raise exception 'Profile target change did not invalidate a stale regeneration'; end if;

  select jsonb_object_agg(p.id::text,p.ctid::text) into before_positions
    from public.study_plans p join target_sync_fixtures f on f.id=p.id where f.kind in ('active','draft');
  update public.profiles set target_sat_score = 1460 where id = auth.uid();
  select jsonb_object_agg(p.id::text,p.ctid::text) into after_positions
    from public.study_plans p join target_sync_fixtures f on f.id=p.id where f.kind in ('active','draft');
  if before_positions is distinct from after_positions then raise exception 'Unchanged target rewrote live plans'; end if;

  update public.profiles set target_sat_score = null where id = auth.uid();
  if exists (select 1 from public.study_plans p join target_sync_fixtures f on f.id=p.id
      where f.kind in ('active','draft') and p.goal_score is not null) then
    raise exception 'Cleared target did not clear live plan goals';
  end if;
  update public.profiles set target_sat_score = 1520 where id = auth.uid();

  update public.profiles set target_sat_score = 1600 where id = '44444444-4444-4444-4444-444444444444';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Student changed another profile target'; end if;
  if has_function_privilege('authenticated','public.sync_profile_study_plan_target()','execute') then
    raise exception 'Trigger was exposed as a callable function';
  end if;
end;
$$;

-- Demo profiles still cannot write, even with the new trigger installed.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","app_metadata":{"is_demo":true}}', true);
do $$
declare affected integer;
begin
  update public.profiles set target_sat_score = 1580 where id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Demo profile target write was allowed'; end if;
end;
$$;
reset role;

-- The existing tutor profile editor writes through the service role.
set local role service_role;
update public.profiles set target_sat_score = 1490 where id = '33333333-3333-3333-3333-333333333333';
reset role;
do $$
begin
  if (select count(*) from public.study_plans p join target_sync_fixtures f on f.id=p.id
      where f.kind in ('active','draft') and p.goal_score=1490) <> 2 then
    raise exception 'Service-role profile edit did not sync live goals';
  end if;
  if exists (select 1 from public.study_plans p join target_sync_plan_before b on b.id=p.id
    where b.kind not in ('active','draft') and p.goal_score is distinct from b.goal_score) then
    raise exception 'Changed a historical plan, ACT plan, or another student';
  end if;
  if exists (select 1 from public.study_plans p join target_sync_plan_before b on b.id=p.id
    where (to_jsonb(p)-'goal_score'-'updated_at') is distinct from b.preserved) then
    raise exception 'Changed plan identity, dates, phases, config, authorship, or stored rationale';
  end if;
  if (select count(*) from public.plan_tasks) <> (select count(*) from target_sync_tasks_before)
     or exists (select 1 from public.plan_tasks t full join target_sync_tasks_before b on b.id=t.id
       where to_jsonb(t) is distinct from b.preserved) then
    raise exception 'Changed tasks or completion history';
  end if;
  if (select p.prosecdef from pg_proc p where p.oid='public.sync_profile_study_plan_target()'::regprocedure) then
    raise exception 'Sync function bypasses row permissions';
  end if;
end;
$$;
rollback;
select 'Profile target sync: live goals, task preservation, history, SAT scope, no-op, and authorization passed' as result;
