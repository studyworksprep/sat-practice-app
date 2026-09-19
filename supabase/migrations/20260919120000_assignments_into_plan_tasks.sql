-- =========================================================
-- Assignments show up on the study plan
-- =========================================================
--
-- Before this, a tutored student with an active plan had two to-do
-- lists that never talked: plan tasks (Today / Plan) and assignments
-- (dashboard panel / assignments page). Now an assignment given to a
-- student with an ACTIVE plan also becomes a plan task with
-- source='tutor' (so re-pacing preserves it), dated to the assignment's
-- due date, linked through payload.assignment_id. Completing the
-- assignment — through any of the app's completion paths, which all
-- stamp assignment_students_v2.completed_at — completes the task;
-- archiving or deleting the assignment skips it; removing the student
-- from the assignment removes it; changing the due date moves it. A
-- plan activated later picks up the student's open assignments.
--
-- Everything lives in triggers so every creation and completion path
-- (create, reassign, add members, submit on behalf, the v1 sync, the
-- three auto-completion helpers) is covered without touching each one.
-- SECURITY DEFINER because the assignment's writer (a tutor) is not
-- necessarily allowed to write the student's plan_tasks under RLS; the
-- functions only ever touch tasks of the affected student's own plan.

-- ── Create / place ─────────────────────────────────────────────────

create or replace function public.plan_task_for_assignment(
  p_assignment_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a         public.assignments_v2%rowtype;
  v_plan_id uuid;
  v_test    date;
  v_created timestamptz;
  v_anchor  date;
  v_due     date;
  v_week    integer;
  v_type    text;
  v_title   text;
  v_minutes integer;
begin
  select * into a from public.assignments_v2
   where id = p_assignment_id and deleted_at is null and archived_at is null;
  if not found then return; end if;

  select id, test_date, created_at into v_plan_id, v_test, v_created
    from public.study_plans
   where student_id = p_student_id
     and status = 'active'
     and test_type = coalesce(a.test_type, 'sat')
   limit 1;
  if v_plan_id is null then return; end if;

  -- One task per (plan, assignment).
  if exists (
    select 1 from public.plan_tasks
     where plan_id = v_plan_id and payload->>'assignment_id' = a.id::text
  ) then return; end if;

  select coalesce(min(scheduled_date), v_created::date) into v_anchor
    from public.plan_tasks where plan_id = v_plan_id;

  -- Due date, but never in the past (an already-overdue assignment
  -- lands on today) and never past test day.
  v_due := greatest(coalesce(a.due_date, current_date), current_date);
  if v_test is not null and v_due > v_test then v_due := v_test; end if;
  v_week := greatest(0, floor((v_due - v_anchor) / 7.0))::integer;

  v_type := case a.assignment_type
              when 'questions'     then 'practice_set'
              when 'practice_test' then 'full_test'
              else 'lesson'
            end;
  v_title := coalesce(nullif(a.title, ''), case a.assignment_type
              when 'questions'     then 'Question set'
              when 'practice_test' then 'Practice test'
              when 'lesson_pack'   then 'Lesson pack'
              else 'Lesson'
            end);
  v_minutes := case v_type when 'full_test' then 180 when 'lesson' then 40 else 30 end;

  insert into public.plan_tasks (plan_id, week_index, scheduled_date, task_type, payload, status, source)
  values (
    v_plan_id, v_week, v_due, v_type,
    jsonb_build_object(
      'assignment_id',   a.id,
      'assignment_type', a.assignment_type,
      'title',           'Assigned: ' || v_title,
      'why',             'Assigned by your tutor',
      'minutes',         v_minutes
    ),
    'pending', 'tutor'
  );
end;
$$;

-- ── assignment_students_v2: create / complete / remove ─────────────

create or replace function public.plan_task_from_assignment_student()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if TG_OP = 'INSERT' then
    -- A junction row stamped complete at insert (e.g. a lesson the
    -- student already finished) needs no task.
    if NEW.completed_at is null then
      perform public.plan_task_for_assignment(NEW.assignment_id, NEW.student_id);
    end if;
    return NEW;
  end if;

  if TG_OP = 'UPDATE' then
    if NEW.completed_at is not null and OLD.completed_at is null then
      update public.plan_tasks pt
         set status = 'completed', completed_at = NEW.completed_at,
             completed_via = 'assignment:' || NEW.assignment_id::text
        from public.study_plans sp
       where pt.plan_id = sp.id
         and sp.student_id = NEW.student_id
         and pt.payload->>'assignment_id' = NEW.assignment_id::text
         and pt.status = 'pending';
    elsif NEW.completed_at is null and OLD.completed_at is not null then
      -- Un-completed (tutor reopened it): reopen the task too.
      update public.plan_tasks pt
         set status = 'pending', completed_at = null, completed_via = null
        from public.study_plans sp
       where pt.plan_id = sp.id
         and sp.student_id = NEW.student_id
         and pt.payload->>'assignment_id' = NEW.assignment_id::text
         and pt.status = 'completed'
         and pt.completed_via = 'assignment:' || NEW.assignment_id::text;
    end if;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    delete from public.plan_tasks pt
     using public.study_plans sp
     where pt.plan_id = sp.id
       and sp.student_id = OLD.student_id
       and pt.payload->>'assignment_id' = OLD.assignment_id::text
       and pt.status = 'pending';
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_plan_task_from_assignment_student on public.assignment_students_v2;
create trigger trg_plan_task_from_assignment_student
  after insert or update of completed_at or delete on public.assignment_students_v2
  for each row execute function public.plan_task_from_assignment_student();

-- ── assignments_v2: archive / delete / due-date change ─────────────

create or replace function public.plan_task_from_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Archived or deleted: the open tasks are no longer owed.
  if (NEW.archived_at is not null and OLD.archived_at is null)
     or (NEW.deleted_at is not null and OLD.deleted_at is null) then
    update public.plan_tasks
       set status = 'skipped', completed_via = 'assignment_closed'
     where payload->>'assignment_id' = NEW.id::text
       and status = 'pending';
  -- Un-archived: bring the skipped tasks back.
  elsif NEW.archived_at is null and OLD.archived_at is not null and NEW.deleted_at is null then
    update public.plan_tasks
       set status = 'pending', completed_via = null
     where payload->>'assignment_id' = NEW.id::text
       and status = 'skipped'
       and completed_via = 'assignment_closed';
  end if;

  -- Due date moved: move the open tasks with it (week re-anchored per plan).
  if NEW.due_date is distinct from OLD.due_date and NEW.due_date is not null then
    update public.plan_tasks pt
       set scheduled_date = least(greatest(NEW.due_date, current_date), coalesce(sp.test_date, NEW.due_date)),
           week_index = greatest(0, floor((
             least(greatest(NEW.due_date, current_date), coalesce(sp.test_date, NEW.due_date))
             - coalesce((select min(scheduled_date) from public.plan_tasks x where x.plan_id = sp.id and x.id <> pt.id), sp.created_at::date)
           ) / 7.0))::integer
      from public.study_plans sp
     where pt.plan_id = sp.id
       and pt.payload->>'assignment_id' = NEW.id::text
       and pt.status = 'pending';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_plan_task_from_assignment_change on public.assignments_v2;
create trigger trg_plan_task_from_assignment_change
  after update of archived_at, deleted_at, due_date on public.assignments_v2
  for each row execute function public.plan_task_from_assignment_change();

-- ── study_plans: a newly activated plan picks up open assignments ──

create or replace function public.plan_tasks_from_open_assignments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if NEW.status = 'active' and OLD.status is distinct from 'active' then
    for r in
      select s.assignment_id
        from public.assignment_students_v2 s
        join public.assignments_v2 a on a.id = s.assignment_id
       where s.student_id = NEW.student_id
         and s.completed_at is null
         and a.archived_at is null
         and a.deleted_at is null
         and coalesce(a.test_type, 'sat') = NEW.test_type
    loop
      perform public.plan_task_for_assignment(r.assignment_id, NEW.student_id);
    end loop;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_plan_tasks_from_open_assignments on public.study_plans;
create trigger trg_plan_tasks_from_open_assignments
  after update of status on public.study_plans
  for each row execute function public.plan_tasks_from_open_assignments();

comment on function public.plan_task_for_assignment(uuid, uuid) is
  'Mirror an open assignment into the student''s active plan as a tutor-sourced task (idempotent per plan+assignment).';
