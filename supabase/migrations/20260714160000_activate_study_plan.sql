-- =========================================================
-- activate_study_plan — flip a reviewed draft to the live plan (§2.4)
-- =========================================================
-- generateStudyPlan (§2.2) writes a DRAFT. A tutor or self-serve student
-- reviews it, then activates it — at which point it becomes the student's
-- one living plan for that test type. Activation is a two-write state
-- change that MUST be atomic:
--
--   1. archive the currently-active plan (if any) for the same
--      (student, test_type)
--   2. set the draft to active
--
-- study_plans_one_active_idx (partial unique on (student_id, test_type)
-- where status='active') forbids two active plans, so step 1 has to
-- happen before step 2 within one transaction. A plpgsql function gives
-- us that transaction for free; doing it as two JS round-trips would
-- leave a window where either zero or two plans are active.
--
-- SECURITY INVOKER: RLS on study_plans (can_view(student_id)) governs
-- who may activate. The initial SELECT is RLS-filtered, so an invisible
-- plan reads as "not found" — no plan is activated and nothing leaks.

create or replace function public.activate_study_plan(p_plan_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_student uuid;
  v_type    text;
  v_status  text;
begin
  select student_id, test_type, status
    into v_student, v_type, v_status
    from public.study_plans
   where id = p_plan_id;

  -- RLS-filtered: a plan the caller can't see reads as absent.
  if not found then
    raise exception 'Plan not found or not accessible';
  end if;

  -- Idempotent: activating the already-active plan is a no-op success.
  if v_status = 'active' then
    return p_plan_id;
  end if;

  if v_status <> 'draft' then
    raise exception 'Only a draft plan can be activated (current status: %)', v_status;
  end if;

  -- Archive the prior active plan FIRST so the one-active unique index
  -- is never momentarily violated.
  update public.study_plans
     set status = 'archived'
   where student_id = v_student
     and test_type  = v_type
     and status     = 'active'
     and id <> p_plan_id;

  update public.study_plans
     set status = 'active'
   where id = p_plan_id;

  return p_plan_id;
end;
$$;

comment on function public.activate_study_plan(uuid) is
  'Activate a draft study plan (§2.4): archives the prior active plan for '
  'the same (student, test_type) and flips the draft to active, atomically. '
  'SECURITY INVOKER — RLS decides who may activate.';

grant execute on function public.activate_study_plan(uuid) to authenticated;
