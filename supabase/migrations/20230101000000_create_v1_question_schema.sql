-- =========================================================
-- v1 question schema — backfilled from production
-- =========================================================
-- These seven tables are the "OG" question schema: questions,
-- their versions, the answer options, correct answers, the
-- question-to-taxonomy mapping, per-student question status,
-- and student attempts. They predate the migration discipline
-- in this repo and so were never captured in any migration
-- file until now.
--
-- Production has had these tables for a long time. A fresh
-- `supabase db reset` / replay from the migrations directory
-- would silently miss them, leaving the dev database unable
-- to serve any practice question, any attempt, any dashboard
-- stat, or any tutor view. That's exactly the drift problem
-- the architecture plan's Phase 1 item 1 was designed to
-- surface; this migration closes one of the largest gaps.
--
-- Phase 3 of the rebuild plan eventually retires these tables
-- in favor of questions_v2. When that happens, this migration
-- becomes redundant and gets archived to the _legacy schema
-- alongside the tables themselves.
--
-- This file uses the 2023-01-01 timestamp prefix so it sorts
-- BEFORE every other timestamped migration in the directory.
-- That's required because 20240101000000_create_practice_tests_schema.sql
-- declares FK constraints against question_versions(id) — so
-- question_versions must exist first.
--
-- The column types, nullability, and defaults below match the
-- production schema dump verbatim. RLS is enabled on every
-- table at creation time so no table is ever briefly wide-open;
-- the actual SELECT/INSERT/UPDATE/DELETE policies come from the
-- legacy non-timestamped migrations (add_broken_audit_fields.sql,
-- fix_manager_practice_test_visibility.sql, add_is_broken_to_
-- question_status.sql, etc.) which sort alphabetically after
-- this file and layer the policies on top.
-- =========================================================

-- 1) questions — root question identity
create table if not exists public.questions (
  id                  uuid not null,
  source              text not null default 'collegeboard',
  source_external_id  text,
  question_id         text,
  status              text not null default 'active',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  is_test_only        boolean not null default false,
  is_broken           boolean not null default false,
  broken_by           uuid references auth.users(id),
  broken_at           timestamptz,
  constraint questions_pkey primary key (id)
);

alter table public.questions enable row level security;

-- 2) question_versions — versioned content for each question.
--    question_id is UNIQUE in prod (not just FK) — treating
--    versioning as "at most one row per question" in this
--    iteration. The `version` + `is_current` columns exist
--    for future multi-version support.
create table if not exists public.question_versions (
  id                  uuid not null,
  question_id         uuid not null unique references public.questions(id),
  version             integer not null,
  is_current          boolean not null default true,
  question_type       text not null,
  stimulus_html       text,
  stem_html           text not null,
  rationale_html      text,
  metadata            jsonb,
  created_at          timestamptz not null default now(),
  attempt_count       integer not null default 0,
  correct_count       integer not null default 0,
  constraint question_versions_pkey primary key (id)
);

alter table public.question_versions enable row level security;

-- 3) answer_options — MCQ option rows for each version
create table if not exists public.answer_options (
  id                    uuid not null,
  question_version_id   uuid not null references public.question_versions(id),
  ordinal               smallint not null,
  label                 text,
  content_html          text not null,
  content_text          text,
  metadata              jsonb,
  created_at            timestamptz not null default now(),
  constraint answer_options_pkey primary key (id)
);

alter table public.answer_options enable row level security;

-- 4) correct_answers — answer key for each version. Supports
--    both MCQ (correct_option_id / correct_option_ids) and SPR
--    (correct_text / correct_number / numeric_tolerance).
create table if not exists public.correct_answers (
  id                    uuid not null,
  question_version_id   uuid not null references public.question_versions(id),
  answer_type           text not null,
  correct_option_id     uuid references public.answer_options(id),
  correct_option_ids    uuid[],
  correct_text          text,
  correct_number        numeric,
  numeric_tolerance     numeric,
  created_at            timestamptz not null default now(),
  constraint correct_answers_pkey primary key (id)
);

alter table public.correct_answers enable row level security;

-- 5) question_taxonomy — domain/skill/difficulty tags. One row
--    per question (PK on question_id, not a composite).
create table if not exists public.question_taxonomy (
  question_id           uuid not null references public.questions(id),
  program               text not null,
  domain_code           text,
  domain_name           text,
  skill_code            text,
  skill_name            text,
  difficulty            smallint not null check (difficulty >= 1 and difficulty <= 3),
  score_band            smallint,
  score_band_range_cd   smallint,
  ppcc                  text,
  ibn                   text,
  source_created_ms     bigint,
  source_updated_ms     bigint,
  constraint question_taxonomy_pkey primary key (question_id)
);

alter table public.question_taxonomy enable row level security;

-- 6) question_status — per-student cache of whether a question
--    has been answered and its most recent result. Composite PK
--    on (user_id, question_id).
create table if not exists public.question_status (
  user_id                 uuid not null references auth.users(id),
  question_id             uuid not null references public.questions(id),
  is_done                 boolean not null default false,
  marked_for_review       boolean not null default false,
  attempts_count          integer not null default 0 check (attempts_count >= 0),
  correct_attempts_count  integer not null default 0 check (correct_attempts_count >= 0),
  last_attempt_at         timestamptz,
  last_is_correct         boolean,
  notes                   text,
  status_json             jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  is_broken               boolean not null default false,
  constraint question_status_pkey primary key (user_id, question_id)
);

alter table public.question_status enable row level security;

-- 7) attempts — single-question answer events. References the
--    answer_options table for MCQ selections; response_text
--    and response_json cover SPR / free-response variants.
create table if not exists public.attempts (
  id                    uuid not null default gen_random_uuid(),
  user_id               uuid not null references auth.users(id),
  question_id           uuid not null references public.questions(id),
  is_correct            boolean not null,
  selected_option_id    uuid references public.answer_options(id),
  response_text         text,
  response_json         jsonb,
  time_spent_ms         integer,
  created_at            timestamptz not null default now(),
  source                text not null default 'practice',
  constraint attempts_pkey primary key (id)
);

alter table public.attempts enable row level security;

-- Minimal indexes for the query patterns Phase 2 code uses. The
-- legacy alphabetic migrations may add more; these are the ones
-- the practice page, the tutor dashboard, and the student review
-- page depend on for reasonable performance. All idempotent.
create index if not exists attempts_user_created_idx
  on public.attempts(user_id, created_at desc);
create index if not exists attempts_user_source_idx
  on public.attempts(user_id, source);
create index if not exists attempts_question_idx
  on public.attempts(question_id);
create index if not exists question_status_user_idx
  on public.question_status(user_id);
create index if not exists question_versions_question_idx
  on public.question_versions(question_id);
create index if not exists answer_options_version_idx
  on public.answer_options(question_version_id);
create index if not exists correct_answers_version_idx
  on public.correct_answers(question_version_id);
create index if not exists question_taxonomy_lookup_idx
  on public.question_taxonomy(program, domain_name, skill_name, difficulty);
