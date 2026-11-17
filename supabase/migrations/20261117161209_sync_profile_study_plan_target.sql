-- Profile SAT targets are live plan metadata, not a reason to rebuild tasks.
-- Run with the profile writer's permissions; existing profile/plan RLS still
-- decides which students they may update. No task or editor configuration is
-- touched, and archived/completed plans retain their historical goals.
create or replace function public.sync_profile_study_plan_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.study_plans
     set goal_score = new.target_sat_score
   where student_id = new.id
     and test_type = 'sat'
     and status in ('active', 'draft')
     and goal_score is distinct from new.target_sat_score;
  return new;
end;
$$;

revoke all on function public.sync_profile_study_plan_target() from public, anon, authenticated;

create trigger trg_sync_profile_study_plan_target
after update of target_sat_score on public.profiles
for each row
when (old.target_sat_score is distinct from new.target_sat_score)
execute function public.sync_profile_study_plan_target();

-- Bring existing live plans into line where a profile target is known.
-- A previously missing profile target does not erase a plan's existing goal;
-- explicitly clearing a target after this migration does clear its live goal.
update public.study_plans p
   set goal_score = s.target_sat_score
  from public.profiles s
 where s.id = p.student_id
   and s.target_sat_score is not null
   and p.test_type = 'sat'
   and p.status in ('active', 'draft')
   and p.goal_score is distinct from s.target_sat_score;
