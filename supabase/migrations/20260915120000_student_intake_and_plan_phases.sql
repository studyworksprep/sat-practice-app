-- =========================================================
-- Student intake + phased study plans
-- (docs/student-onboarding-and-plan-redesign-2026-09.md, Phase 1)
-- =========================================================
--
-- 1. student_intake — one row per student holding the onboarding
--    answers that shape a plan (prep level, intent, chosen targets,
--    availability, per-domain self-assessment). The wizard derives its
--    current step from this row, so the flow is resumable; the plan
--    generator reads it when a tutor generates for the student, so
--    both paths build the same kind of plan.
--
-- 2. study_plans — the plan now records the mode it was composed in,
--    the intake answers it was built from, its phase list, and the
--    generator's rationale sentence (previously computed and thrown
--    away). All nullable/defaulted so existing rows are untouched.

-- ── student_intake ─────────────────────────────────────────────

create table if not exists public.student_intake (
  student_id    uuid primary key references public.profiles(id) on delete cascade,
  prep_level    text check (prep_level is null or prep_level in ('none', 'some', 'a_lot')),
  intent        text check (intent is null or intent in ('guide_me', 'own_targets')),
  -- [{ "domain_code": "H", "skill_code": "H.A." }, …]
  targets       jsonb not null default '[]'::jsonb,
  weekly_hours  int check (weekly_hours is null or (weekly_hours between 1 and 40)),
  -- [0..6], 0 = Sunday. Null = not answered yet; [] is invalid at write time.
  study_days    jsonb,
  -- { "H": 3, "P": 2, … } — 1..5 comfort per SAT domain code.
  self_rating   jsonb,
  focus_note    text,
  completed_at  timestamptz,
  skipped_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.student_intake is
  'Onboarding answers that shape a study plan (one row per student). The /welcome wizard derives its step from this row.';

drop trigger if exists trg_student_intake_updated_at on public.student_intake;
create trigger trg_student_intake_updated_at
  before update on public.student_intake
  for each row execute function public.set_updated_at();

-- Student-owned, tutor-visible — same gate as study_plans.
alter table public.student_intake enable row level security;
drop policy if exists student_intake_select on public.student_intake;
drop policy if exists student_intake_insert on public.student_intake;
drop policy if exists student_intake_update on public.student_intake;
drop policy if exists student_intake_delete on public.student_intake;

create policy student_intake_select on public.student_intake
  for select to authenticated using (public.can_view(student_id));
create policy student_intake_insert on public.student_intake
  for insert to authenticated with check (public.can_view(student_id));
create policy student_intake_update on public.student_intake
  for update to authenticated using (public.can_view(student_id)) with check (public.can_view(student_id));
create policy student_intake_delete on public.student_intake
  for delete to authenticated using (public.can_view(student_id));

-- ── study_plans: mode, intake echo, phases, rationale ───────────

alter table public.study_plans
  add column if not exists mode       text,
  add column if not exists prep_level text,
  add column if not exists intent     text,
  add column if not exists rationale  text,
  add column if not exists phases     jsonb not null default '[]'::jsonb;

alter table public.study_plans drop constraint if exists study_plans_mode_check;
alter table public.study_plans add constraint study_plans_mode_check
  check (mode is null or mode in ('foundations', 'targeted', 'self_directed'));

alter table public.study_plans drop constraint if exists study_plans_prep_level_check;
alter table public.study_plans add constraint study_plans_prep_level_check
  check (prep_level is null or prep_level in ('none', 'some', 'a_lot'));

alter table public.study_plans drop constraint if exists study_plans_intent_check;
alter table public.study_plans add constraint study_plans_intent_check
  check (intent is null or intent in ('guide_me', 'own_targets'));

comment on column public.study_plans.mode is
  'How the plan was composed: foundations (coverage → focus → rehearsal), targeted (focus → rehearsal), self_directed (targets → rehearsal). Null = pre-phase plan.';
comment on column public.study_plans.phases is
  '[{ "type": "coverage"|"focus"|"rehearsal"|"targets", "start_week": n, "end_week": n, "summary": "…" }] — inclusive 0-based week ranges.';
comment on column public.study_plans.rationale is
  'The generator''s one-paragraph explanation of the plan, shown on the preview and the plan hub.';

-- Self-directed plans can opt out of scheduled full-length tests (§3.2
-- step 3). Lives on the intake so a rebuild keeps the answer.
alter table public.student_intake
  add column if not exists full_tests boolean not null default true;
