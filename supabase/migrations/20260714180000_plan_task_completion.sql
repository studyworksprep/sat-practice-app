-- =========================================================
-- Plan-task completion auto-detection (§2.1 promise / Phase 2)
-- =========================================================
-- study_plans/plan_tasks were designed so "finishing the linked
-- session/lesson/test marks the task done" automatically. This migration
-- delivers that with triggers on the completion events.
--
-- Two matching strategies, chosen for ROBUSTNESS over reach:
--
--   1. Forward linkage (exact). A task started from the plan (the "Today"
--      screen, §2.3) stamps its id onto the practice_session /
--      practice_test_attempt it spawns via a new plan_task_id column. When
--      that row completes, the trigger marks exactly that task done. Zero
--      ambiguity, works for any task type that spawns a session/attempt.
--
--   2. Natural match for full tests (works today, no UI needed). The
--      generator schedules generic "take a full-length test" checkpoints
--      with no specific test id, so any completed full test satisfies the
--      earliest pending full_test task on the student's active plan.
--
-- Deliberately NOT matched here: drills/lessons by content. Production
-- practice_sessions store the skill filter as a `skills` array of skill
-- *descriptions* (e.g. "Words in Context"), not the skill *codes* the
-- generator emits, and a single session bundles many skills — so content
-- matching would be unreliable and produce false completions. Those task
-- types complete via forward linkage once the "Today" screen starts them.
--
-- Triggers are SECURITY DEFINER + tightly scoped to the event owner's own
-- tasks (sp.student_id = NEW.user_id), and fire only on the completed
-- transition (WHEN clause) so there is no per-update overhead on these
-- hot tables.

-- ── Forward-linkage columns ────────────────────────────────────────
alter table public.practice_sessions
  add column if not exists plan_task_id uuid references public.plan_tasks(id) on delete set null;
alter table public.practice_test_attempts_v2
  add column if not exists plan_task_id uuid references public.plan_tasks(id) on delete set null;

create index if not exists practice_sessions_plan_task_idx
  on public.practice_sessions (plan_task_id) where plan_task_id is not null;
create index if not exists ptattempts_plan_task_idx
  on public.practice_test_attempts_v2 (plan_task_id) where plan_task_id is not null;

comment on column public.practice_sessions.plan_task_id is
  'The plan_task this session was started to satisfy (§2 completion '
  'detection). Set when launched from a study plan; null for ad-hoc '
  'practice. On completion a trigger marks the linked task done.';
comment on column public.practice_test_attempts_v2.plan_task_id is
  'The plan_task this attempt was started to satisfy (§2 completion '
  'detection). Null for ad-hoc attempts.';

-- ── Trigger: a completed practice session marks its linked task ─────
create or replace function public.plan_task_from_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.plan_tasks pt
     set status = 'completed', completed_at = now(), completed_via = NEW.id::text
    from public.study_plans sp
   where pt.id = NEW.plan_task_id
     and pt.plan_id = sp.id
     and sp.student_id = NEW.user_id   -- the task must belong to the session's owner
     and pt.status = 'pending';
  return NEW;
end;
$$;

drop trigger if exists trg_plan_task_from_session on public.practice_sessions;
create trigger trg_plan_task_from_session
  after update on public.practice_sessions
  for each row
  when (NEW.status = 'completed'
        and OLD.status is distinct from 'completed'
        and NEW.plan_task_id is not null)
  execute function public.plan_task_from_session();

-- ── Trigger: a completed test attempt marks its task ───────────────
-- Exact link if present; otherwise the earliest pending full_test task.
create or replace function public.plan_task_from_test_attempt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if NEW.plan_task_id is not null then
    update public.plan_tasks pt
       set status = 'completed', completed_at = now(), completed_via = NEW.id::text
      from public.study_plans sp
     where pt.id = NEW.plan_task_id
       and pt.plan_id = sp.id
       and sp.student_id = NEW.user_id
       and pt.status = 'pending';
    return NEW;
  end if;

  update public.plan_tasks pt
     set status = 'completed', completed_at = now(), completed_via = NEW.id::text
   where pt.id = (
     select pt2.id
       from public.plan_tasks pt2
       join public.study_plans sp on sp.id = pt2.plan_id
      where sp.student_id = NEW.user_id
        and sp.status = 'active'
        and pt2.status = 'pending'
        and pt2.task_type = 'full_test'
        and pt2.created_at <= coalesce(NEW.finished_at, now())
      order by pt2.scheduled_date nulls last, pt2.created_at
      limit 1
   );
  return NEW;
end;
$$;

drop trigger if exists trg_plan_task_from_test_attempt on public.practice_test_attempts_v2;
create trigger trg_plan_task_from_test_attempt
  after update on public.practice_test_attempts_v2
  for each row
  when (NEW.status = 'completed' and OLD.status is distinct from 'completed')
  execute function public.plan_task_from_test_attempt();
