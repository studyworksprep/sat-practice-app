-- =========================================================
-- Practice tests schema — backfilled from production
-- =========================================================
-- These seven tables exist in the live database but were
-- never committed as a migration. This file matches the
-- production schema as of April 2026, verified against a
-- direct dump shared by the maintainer. Any future changes
-- to these tables go through new migration files, not edits
-- to this one.
--
-- RLS policies are NOT defined here. They exist in production
-- but have never been captured as migration files — the same
-- drift problem this file fixes for the schema itself. A
-- follow-up migration will dump the current policies from
-- prod (via `select * from pg_policies where schemaname =
-- 'public' and tablename like 'practice_test%'`) and commit
-- them as `YYYYMMDDHHMMSS_create_practice_tests_rls.sql`. In
-- the meantime, `alter table ... enable row level security`
-- is called so a fresh replay never leaves these tables
-- briefly wide-open; Phase 2 fills in the policies before
-- any route under `app/next/*` reads from them.
--
-- This file uses the YYYYMMDDHHMMSS_*.sql Supabase CLI naming
-- convention so it sorts before existing migrations (e.g.
-- add_teacher_student_assignments.sql) that already expect
-- `practice_test_attempts` to exist.
-- =========================================================

-- 1) practice_tests
create table if not exists public.practice_tests (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  is_published      boolean not null default false,
  is_adaptive       boolean not null default true,
  is_frozen         boolean not null default true,
  adaptive_version  text,
  created_at        timestamptz not null default now()
);

alter table public.practice_tests enable row level security;

-- 2) practice_test_modules
-- Note: prod has no FK on practice_test_id; we match that. FK hardening
-- moves to Phase 3 along with the rest of the schema discipline work.
-- `route_code` is NOT NULL in prod even though the application uses
-- an empty string (or sentinel) for module 1 — the code in
-- submit-module/route.js infers module-1 rows by `module_number = 1`,
-- not by null route_code.
create table if not exists public.practice_test_modules (
  id                  uuid primary key default gen_random_uuid(),
  practice_test_id    uuid not null,
  subject_code        text not null,
  module_number       integer not null,
  route_code          text not null,
  time_limit_seconds  integer not null,
  created_at          timestamptz not null default now()
);

alter table public.practice_test_modules enable row level security;

-- 3) practice_test_module_items
create table if not exists public.practice_test_module_items (
  id                        uuid primary key default gen_random_uuid(),
  practice_test_module_id   uuid not null references public.practice_test_modules(id),
  question_version_id       uuid not null references public.question_versions(id),
  ordinal                   integer not null,
  created_at                timestamptz not null default now()
);

alter table public.practice_test_module_items enable row level security;

-- 4) practice_test_attempts
-- Prod has no FK constraints on this table's `user_id` or
-- `practice_test_id` columns. We match prod. Composite/section scaled
-- scores are persisted here after grading so the results page can
-- render without re-running the scoring pipeline.
create table if not exists public.practice_test_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  practice_test_id  uuid not null,
  adaptive_version  text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'in_progress',
  metadata          jsonb not null default '{}'::jsonb,
  composite_score   integer,
  rw_scaled         integer,
  math_scaled       integer
);

alter table public.practice_test_attempts enable row level security;

-- 5) practice_test_module_attempts
create table if not exists public.practice_test_module_attempts (
  id                         uuid primary key default gen_random_uuid(),
  practice_test_attempt_id   uuid not null references public.practice_test_attempts(id),
  practice_test_module_id    uuid not null references public.practice_test_modules(id),
  started_at                 timestamptz not null default now(),
  finished_at                timestamptz,
  correct_count              integer,
  raw_score                  integer,
  metadata                   jsonb not null default '{}'::jsonb
);

alter table public.practice_test_module_attempts enable row level security;

-- 6) practice_test_item_attempts
-- Note: prod has `attempt_id uuid NOT NULL`, not the ON DELETE SET NULL
-- pattern I originally guessed. The DELETE handler in
-- app/api/practice-tests/attempt/[attemptId]/route.js reflects this:
-- it collects the attempt_ids first, deletes item_attempts, then
-- deletes the attempts rows — a two-step because there's no cascade.
create table if not exists public.practice_test_item_attempts (
  id                                 uuid primary key default gen_random_uuid(),
  practice_test_module_attempt_id    uuid not null references public.practice_test_module_attempts(id),
  practice_test_module_item_id       uuid not null references public.practice_test_module_items(id),
  attempt_id                         uuid not null references public.attempts(id)
);

alter table public.practice_test_item_attempts enable row level security;

-- 7) practice_test_routing_rules
create table if not exists public.practice_test_routing_rules (
  id                    uuid primary key default gen_random_uuid(),
  practice_test_id      uuid not null,
  subject_code          text not null,
  from_module_number    integer not null,
  metric                text not null,
  operator              text not null,
  threshold             integer not null,
  to_route_code         text not null,
  created_at            timestamptz not null default now()
);

alter table public.practice_test_routing_rules enable row level security;

-- Useful indexes. None of these come from the prod schema dump
-- (which lists only tables/columns/constraints, not indexes), so
-- these are speculative additions sized to the query patterns in
-- app/api/practice-tests/*. They are safe to add — indexes only
-- make reads faster and writes marginally slower — but check
-- `select * from pg_indexes where tablename like 'practice_test%'`
-- against prod and reconcile any differences when convenient.
create index if not exists practice_tests_published_idx
  on public.practice_tests(is_published);
create index if not exists ptm_test_idx
  on public.practice_test_modules(practice_test_id);
create index if not exists ptm_lookup_idx
  on public.practice_test_modules(practice_test_id, subject_code, module_number);
create index if not exists ptmi_module_idx
  on public.practice_test_module_items(practice_test_module_id);
create index if not exists ptmi_version_idx
  on public.practice_test_module_items(question_version_id);
create index if not exists pta_user_idx
  on public.practice_test_attempts(user_id);
create index if not exists pta_user_status_idx
  on public.practice_test_attempts(user_id, status);
create index if not exists pta_test_idx
  on public.practice_test_attempts(practice_test_id);
create index if not exists ptma_attempt_idx
  on public.practice_test_module_attempts(practice_test_attempt_id);
create index if not exists ptma_module_idx
  on public.practice_test_module_attempts(practice_test_module_id);
create index if not exists ptia_module_attempt_idx
  on public.practice_test_item_attempts(practice_test_module_attempt_id);
create index if not exists ptia_module_item_idx
  on public.practice_test_item_attempts(practice_test_module_item_id);
create index if not exists ptia_attempt_idx
  on public.practice_test_item_attempts(attempt_id);
create index if not exists ptrr_lookup_idx
  on public.practice_test_routing_rules(practice_test_id, subject_code, from_module_number);
