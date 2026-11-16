-- Existing lesson/practice sequences are units too. Keep later practice
-- in week-sized blocks so moving the learning unit does not sweep up
-- every follow-up drill through test day.
with ordered as (
  select id, payload->>'skill_code' as skill, week_index, task_type,
    row_number() over (partition by plan_id, payload->>'skill_code', task_type,
      coalesce(payload->>'unit_step_id', '') order by scheduled_date nulls first, created_at, id) as occurrence
  from public.plan_tasks
  where payload ? 'skill_code' and not (payload ? 'plan_unit_key') and not (payload ? 'assignment_id')
    and task_type in ('lesson', 'drill')
)
update public.plan_tasks t set payload = t.payload || jsonb_build_object('plan_unit_key',
  'skill:' || o.skill || case when o.task_type = 'lesson' or o.occurrence = 1 then ':learn' else ':practice:' || o.week_index end)
from ordered o where o.id = t.id;

-- Learning tasks keep their identity when a new pace moves them to a
-- different week. Later recurring practice remains week-specific.
with learning as (
  select id, 'learn:' || task_type || ':' || coalesce(payload->>'skill_code', '') || ':' ||
    coalesce(payload->>'unit_step_id', payload->>'lesson_id', '') || ':' || coalesce(payload->>'drill_role', '') || ':' ||
    row_number() over (partition by plan_id, task_type, payload->>'skill_code',
      coalesce(payload->>'unit_step_id', payload->>'lesson_id', ''), payload->>'drill_role'
      order by scheduled_date nulls first, created_at, id) as task_key
  from public.plan_tasks where source = 'generated'
    and (task_type = 'lesson' or payload->>'plan_unit_key' like '%:learn')
)
update public.plan_tasks t set payload = t.payload || jsonb_build_object('generation_key', l.task_key)
from learning l where l.id = t.id and t.payload->>'generation_key' like 'w%';
