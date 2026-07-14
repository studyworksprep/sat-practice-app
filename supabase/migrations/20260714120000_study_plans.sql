-- =========================================================
-- study_plans + plan_tasks — the plan engine's data layer (§2.1)
-- =========================================================
-- Phase 2 turns Phase 1's knowledge model into a *living study plan*: a
-- student with a goal and a test date gets a week-by-week schedule of
-- concrete daily tasks, and the app opens to "what to do today." This
-- migration is only the foundation — the two tables a plan is made of.
-- The generator (§2.2) and the surfaces (§2.3-2.5) come later; nothing
-- user-facing ships here.
--
-- study_plans = one student's goal + settings (their "living plan").
-- plan_tasks  = the individual scheduled items that make up that plan.
--
-- Tasks intentionally reference EXISTING objects by id / filter-criteria
-- (lesson ids, the same filter_criteria shape practice_sessions already
-- stores, practice-test ids) so that completion detection can be
-- automatic later: finishing the linked session / lesson / test marks
-- the task done. That linkage rides in payload (jsonb) rather than a
-- forest of nullable FKs, because task_type determines which id applies.

create table if not exists public.study_plans (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references auth.users(id) on delete cascade,
  -- who created the plan: the student (self-serve) or a tutor (§2.4).
  -- Kept if the creator is later removed, so plan provenance survives.
  created_by     uuid references auth.users(id) on delete set null,
  test_type      text not null default 'sat' check (test_type in ('sat', 'act')),
  -- Scaled scores. The check is deliberately loose (covers SAT 400-1600
  -- and ACT 1-36); test_type-specific validation lives in the app layer.
  goal_score     integer check (goal_score is null or goal_score between 1 and 1600),
  starting_score integer check (starting_score is null or starting_score between 1 and 1600),
  test_date      date,
  status         text not null default 'draft'
                   check (status in ('draft', 'active', 'completed', 'archived')),
  -- Declared weekly hours + generator preferences, asked at creation.
  config         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.study_plans is
  'A student''s living study plan (§2.1): goal, test date, baseline, and '
  'settings. Tasks live in plan_tasks. At most one active plan per '
  '(student, test_type) — enforced by a partial unique index.';

-- A student has at most one ACTIVE plan per test type (their current
-- "living plan"). Regeneration (§2.5) must archive the old plan as it
-- activates the new one, in one transaction, to respect this.
create unique index if not exists study_plans_one_active_idx
  on public.study_plans (student_id, test_type) where status = 'active';
create index if not exists study_plans_student_idx
  on public.study_plans (student_id, test_type, status);

drop trigger if exists trg_study_plans_updated_at on public.study_plans;
create trigger trg_study_plans_updated_at
  before update on public.study_plans
  for each row execute function public.set_updated_at();

create table if not exists public.plan_tasks (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references public.study_plans(id) on delete cascade,
  week_index   integer not null default 0 check (week_index >= 0),
  scheduled_date date,
  task_type    text not null check (task_type in
                 ('lesson', 'drill', 'review', 'practice_set', 'full_test', 'vocab', 'flashcards')),
  -- The task's target + why-this copy. Shape depends on task_type:
  --   drill/practice_set → { filter_criteria: {…} }  (same shape as
  --                          practice_sessions.filter_criteria, so the
  --                          existing runner + completion path is reused)
  --   lesson             → { lesson_id }
  --   full_test          → { practice_test_id }
  --   review/vocab/flashcards → queue / set references
  --   plus optional { title, why } for the student-facing rationale
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending'
                 check (status in ('pending', 'completed', 'skipped')),
  -- Who put this task here. Tutor edits (§2.4) set source='tutor' so
  -- regeneration (§2.5) never clobbers human judgment.
  source       text not null default 'generated'
                 check (source in ('generated', 'tutor', 'student')),
  completed_at timestamptz,
  -- How it was completed — the id of the session/lesson/attempt that
  -- satisfied it, or 'manual' for a hand-checked task.
  completed_via text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.plan_tasks is
  'Individual scheduled items of a study plan (§2.1). payload references '
  'existing objects by id / filter_criteria so completion is auto-detected. '
  'source=tutor marks human edits that regeneration must preserve.';

create index if not exists plan_tasks_plan_date_idx
  on public.plan_tasks (plan_id, scheduled_date);
create index if not exists plan_tasks_plan_status_idx
  on public.plan_tasks (plan_id, status);

drop trigger if exists trg_plan_tasks_updated_at on public.plan_tasks;
create trigger trg_plan_tasks_updated_at
  before update on public.plan_tasks
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────
-- A plan is student-owned but tutor-manageable. can_view(student_id)
-- is true for the student themselves AND their tutor / manager / admin,
-- so it gates both reads and writes: self-serve students edit their own
-- plan; tutors edit their students' plans (§2.4). plan_tasks inherit the
-- gate through their parent plan.

alter table public.study_plans enable row level security;
drop policy if exists study_plans_select on public.study_plans;
drop policy if exists study_plans_insert on public.study_plans;
drop policy if exists study_plans_update on public.study_plans;
drop policy if exists study_plans_delete on public.study_plans;

create policy study_plans_select on public.study_plans
  for select to authenticated using (public.can_view(student_id));
create policy study_plans_insert on public.study_plans
  for insert to authenticated with check (public.can_view(student_id));
create policy study_plans_update on public.study_plans
  for update to authenticated using (public.can_view(student_id)) with check (public.can_view(student_id));
create policy study_plans_delete on public.study_plans
  for delete to authenticated using (public.can_view(student_id));

alter table public.plan_tasks enable row level security;
drop policy if exists plan_tasks_select on public.plan_tasks;
drop policy if exists plan_tasks_insert on public.plan_tasks;
drop policy if exists plan_tasks_update on public.plan_tasks;
drop policy if exists plan_tasks_delete on public.plan_tasks;

create policy plan_tasks_select on public.plan_tasks
  for select to authenticated using (exists (
    select 1 from public.study_plans p where p.id = plan_tasks.plan_id and public.can_view(p.student_id)));
create policy plan_tasks_insert on public.plan_tasks
  for insert to authenticated with check (exists (
    select 1 from public.study_plans p where p.id = plan_tasks.plan_id and public.can_view(p.student_id)));
create policy plan_tasks_update on public.plan_tasks
  for update to authenticated using (exists (
    select 1 from public.study_plans p where p.id = plan_tasks.plan_id and public.can_view(p.student_id)))
  with check (exists (
    select 1 from public.study_plans p where p.id = plan_tasks.plan_id and public.can_view(p.student_id)));
create policy plan_tasks_delete on public.plan_tasks
  for delete to authenticated using (exists (
    select 1 from public.study_plans p where p.id = plan_tasks.plan_id and public.can_view(p.student_id)));

grant select, insert, update, delete on public.study_plans to authenticated;
grant select, insert, update, delete on public.plan_tasks  to authenticated;
grant all on public.study_plans to service_role;
grant all on public.plan_tasks  to service_role;
