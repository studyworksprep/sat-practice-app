-- =========================================================
-- Practice tests schema — backfilled from production
-- =========================================================
-- These seven tables exist in the live database but were
-- never committed as a migration. This file is reverse-
-- engineered from the code that queries them:
--
--   - app/api/practice-tests/route.js
--   - app/api/practice-tests/start/route.js
--   - app/api/practice-tests/attempt/[attemptId]/route.js
--   - app/api/practice-tests/attempt/[attemptId]/submit-module/route.js
--   - app/api/practice-tests/attempt/[attemptId]/results/route.js
--   - app/api/practice-tests/attempt/[attemptId]/abandon/route.js
--   - app/api/admin/routing-rules/route.js
--
-- BEFORE applying this migration to a fresh dev Supabase
-- project, diff it against `\d public.practice_test_*` from
-- production. Any columns or constraints present in prod but
-- missing here should be added before committing. The goal
-- of this migration is that a fresh `supabase db reset`
-- reproduces the prod schema well enough that every
-- practice-tests API route works against it.
--
-- This file uses the YYYYMMDDHHMMSS_*.sql Supabase CLI
-- naming convention so it sorts before existing migrations
-- that reference these tables (e.g. add_teacher_student_
-- assignments.sql creates RLS policies on practice_test_
-- attempts). The rest of the migration directory will be
-- renormalized to timestamp prefixes in a follow-up.
-- =========================================================

-- 1) practice_tests — one row per published/unpublished test
create table if not exists public.practice_tests (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  is_adaptive   boolean not null default true,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists practice_tests_published_idx
  on public.practice_tests(is_published);

-- 2) practice_test_modules — N modules per test, grouped by
-- subject_code (e.g. 'RW', 'MATH') and module_number (1 or 2).
-- Module 2 rows have a route_code ('easy'|'hard') distinguishing
-- the adaptive variant; module 1 rows have route_code NULL.
create table if not exists public.practice_test_modules (
  id                  uuid primary key default gen_random_uuid(),
  practice_test_id    uuid not null references public.practice_tests(id) on delete cascade,
  subject_code        text not null,
  module_number       smallint not null,
  route_code          text,
  time_limit_seconds  integer
);

create index if not exists ptm_test_idx
  on public.practice_test_modules(practice_test_id);
create index if not exists ptm_lookup_idx
  on public.practice_test_modules(practice_test_id, subject_code, module_number);

-- 3) practice_test_module_items — ordered list of question
-- versions within a module. `ordinal` is the question position
-- (1..N). `question_version_id` points at the v1 question_versions
-- table; we keep that linkage here through Phase 3 so the v1
-- legacy table can be archived cleanly.
create table if not exists public.practice_test_module_items (
  id                        uuid primary key default gen_random_uuid(),
  practice_test_module_id   uuid not null references public.practice_test_modules(id) on delete cascade,
  ordinal                   smallint not null,
  question_version_id       uuid not null,
  unique (practice_test_module_id, ordinal)
);

create index if not exists ptmi_module_idx
  on public.practice_test_module_items(practice_test_module_id);
create index if not exists ptmi_version_idx
  on public.practice_test_module_items(question_version_id);

-- 4) practice_test_attempts — one row per user-initiated test run.
-- status progresses 'in_progress' -> 'completed' | 'abandoned'.
-- metadata carries the adaptive routing state (rw_route_code,
-- m_route_code), the sections filter ('rw'|'math' or absent for
-- both), and a running list of submitted_modules so progress
-- can be recovered even if practice_test_item_attempts rows are
-- temporarily unreadable via RLS.
create table if not exists public.practice_test_attempts (
  id                uuid primary key default gen_random_uuid(),
  practice_test_id  uuid not null references public.practice_tests(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  status            text not null default 'in_progress',
  metadata          jsonb not null default '{}'::jsonb,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz
);

create index if not exists pta_user_idx
  on public.practice_test_attempts(user_id);
create index if not exists pta_user_status_idx
  on public.practice_test_attempts(user_id, status);
create index if not exists pta_test_idx
  on public.practice_test_attempts(practice_test_id);

-- RLS is enabled here but the SELECT/INSERT/UPDATE policies
-- are defined in add_teacher_student_assignments.sql (which
-- runs after this file alphabetically). We enable RLS at
-- creation time so the table is never briefly wide-open.
alter table public.practice_test_attempts enable row level security;

-- 5) practice_test_module_attempts — one row per module the
-- user has submitted within an attempt. correct_count and
-- raw_score are persisted at submission time so the results
-- page can score without re-running grading.
create table if not exists public.practice_test_module_attempts (
  id                         uuid primary key default gen_random_uuid(),
  practice_test_attempt_id   uuid not null references public.practice_test_attempts(id) on delete cascade,
  practice_test_module_id    uuid not null references public.practice_test_modules(id) on delete cascade,
  started_at                 timestamptz,
  finished_at                timestamptz,
  correct_count              integer default 0,
  raw_score                  integer default 0,
  metadata                   jsonb not null default '{}'::jsonb
);

create index if not exists ptma_attempt_idx
  on public.practice_test_module_attempts(practice_test_attempt_id);
create index if not exists ptma_module_idx
  on public.practice_test_module_attempts(practice_test_module_id);

alter table public.practice_test_module_attempts enable row level security;

-- The select policy below mirrors the pattern in
-- fix_manager_practice_test_visibility.sql. Owner can see
-- their own rows; teachers/managers/admins see via the same
-- helper as the parent practice_test_attempts table.
drop policy if exists ptma_select on public.practice_test_module_attempts;
create policy ptma_select on public.practice_test_module_attempts
  for select using (
    exists (
      select 1 from public.practice_test_attempts pta
      where pta.id = practice_test_module_attempts.practice_test_attempt_id
        and (pta.user_id = auth.uid() or public.teacher_can_view_student(pta.user_id))
    )
  );

drop policy if exists ptma_insert on public.practice_test_module_attempts;
create policy ptma_insert on public.practice_test_module_attempts
  for insert with check (
    exists (
      select 1 from public.practice_test_attempts pta
      where pta.id = practice_test_module_attempts.practice_test_attempt_id
        and (pta.user_id = auth.uid() or public.is_admin())
    )
  );

-- 6) practice_test_item_attempts — join row between a single
-- question within a module-attempt and the corresponding row in
-- the shared `attempts` table (which stores the actual graded
-- answer). This is why deleting an attempt cascades from here
-- down: see attempt/[attemptId]/route.js DELETE handler.
create table if not exists public.practice_test_item_attempts (
  id                                 uuid primary key default gen_random_uuid(),
  practice_test_module_attempt_id    uuid not null references public.practice_test_module_attempts(id) on delete cascade,
  practice_test_module_item_id       uuid not null references public.practice_test_module_items(id) on delete cascade,
  attempt_id                         uuid references public.attempts(id) on delete set null,
  unique (practice_test_module_attempt_id, practice_test_module_item_id)
);

create index if not exists ptia_module_attempt_idx
  on public.practice_test_item_attempts(practice_test_module_attempt_id);
create index if not exists ptia_module_item_idx
  on public.practice_test_item_attempts(practice_test_module_item_id);
create index if not exists ptia_attempt_idx
  on public.practice_test_item_attempts(attempt_id);

alter table public.practice_test_item_attempts enable row level security;

drop policy if exists ptia_select on public.practice_test_item_attempts;
create policy ptia_select on public.practice_test_item_attempts
  for select using (
    exists (
      select 1
      from public.practice_test_module_attempts ptma
      join public.practice_test_attempts pta on pta.id = ptma.practice_test_attempt_id
      where ptma.id = practice_test_item_attempts.practice_test_module_attempt_id
        and (pta.user_id = auth.uid() or public.teacher_can_view_student(pta.user_id))
    )
  );

-- 7) practice_test_routing_rules — admin-configurable thresholds
-- that pick which Module 2 route_code a student is placed on
-- based on their Module 1 performance. See submit-module/route.js
-- for the evaluation order. Module 2 defaults are applied in
-- application code if no rule matches.
create table if not exists public.practice_test_routing_rules (
  id                    uuid primary key default gen_random_uuid(),
  practice_test_id      uuid not null references public.practice_tests(id) on delete cascade,
  subject_code          text not null,
  from_module_number    smallint not null default 1,
  metric                text not null default 'correct_count',
  operator              text not null,
  threshold             numeric not null,
  to_route_code         text not null
);

create index if not exists ptrr_lookup_idx
  on public.practice_test_routing_rules(practice_test_id, subject_code, from_module_number);

alter table public.practice_test_routing_rules enable row level security;

-- Only admins manage routing rules; readable by anyone authed
-- so the grading flow in submit-module can load the rules.
drop policy if exists ptrr_select on public.practice_test_routing_rules;
create policy ptrr_select on public.practice_test_routing_rules
  for select using (auth.uid() is not null);

drop policy if exists ptrr_write on public.practice_test_routing_rules;
create policy ptrr_write on public.practice_test_routing_rules
  for all using (public.is_admin()) with check (public.is_admin());

-- practice_tests and practice_test_modules are catalog data.
-- Enable RLS and allow read to any authed user; writes admin-only.
alter table public.practice_tests enable row level security;

drop policy if exists pt_select on public.practice_tests;
create policy pt_select on public.practice_tests
  for select using (auth.uid() is not null);

drop policy if exists pt_write on public.practice_tests;
create policy pt_write on public.practice_tests
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.practice_test_modules enable row level security;

drop policy if exists ptm_select on public.practice_test_modules;
create policy ptm_select on public.practice_test_modules
  for select using (auth.uid() is not null);

drop policy if exists ptm_write on public.practice_test_modules;
create policy ptm_write on public.practice_test_modules
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.practice_test_module_items enable row level security;

drop policy if exists ptmi_select on public.practice_test_module_items;
create policy ptmi_select on public.practice_test_module_items
  for select using (auth.uid() is not null);

drop policy if exists ptmi_write on public.practice_test_module_items;
create policy ptmi_write on public.practice_test_module_items
  for all using (public.is_admin()) with check (public.is_admin());
