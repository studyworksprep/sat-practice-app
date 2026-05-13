-- =========================================================
-- act_score_conversion — per-form raw → scaled lookups
-- =========================================================
-- See docs/architecture-plan.md §3.4 "Cross-test data model"
-- (strictly-separate tables: score_conversion for SAT 200-1600
-- vs. act_score_conversion for ACT 1-36).
--
-- ACT score curves differ per test form — a raw score of 32 on
-- ACT 2023 April Form A's English section does not necessarily
-- scale to the same number as a raw 32 on ACT 2024 June Form B.
-- The natural shape is one row per (source_test, section,
-- raw_score) carrying its scaled value.
--
-- Composite score is computed at finalize time as the rounded
-- average of the four section scaled scores (the standard ACT
-- rule), not stored here — only section curves live in this
-- table.
--
-- This table is the reference-data analog of public.score_conversion
-- (SAT). It is administrative content, not user data: any
-- authenticated user may read; only admins write.

create table if not exists public.act_score_conversion (
  -- e.g. "ACT 2023 April Form A". Matches act_questions.source_test
  -- and act_practice_test_attempts.source_test exactly.
  source_test   text not null,

  -- One of the four ACT sections.
  section       text not null check (section in ('english', 'math', 'reading', 'science')),

  -- Number of correct answers in this section on this form.
  -- Bound by the section's question count for that form (35 for
  -- reading/science, 40 for math, 75 for english on classic ACT;
  -- the check just enforces sanity).
  raw_score     int  not null check (raw_score >= 0 and raw_score <= 100),

  -- Scaled 1-36 score corresponding to the raw count.
  scaled_score  int  not null check (scaled_score between 1 and 36),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  primary key (source_test, section, raw_score)
);

-- RLS: public read (reference data), admin-only write. Same shape
-- as score_conversion (SAT side).

alter table public.act_score_conversion enable row level security;

drop policy if exists act_score_conversion_select       on public.act_score_conversion;
drop policy if exists act_score_conversion_admin_write  on public.act_score_conversion;

create policy act_score_conversion_select on public.act_score_conversion
  for select to public using (true);

create policy act_score_conversion_admin_write on public.act_score_conversion
  for all to public
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.act_score_conversion is
  'ACT raw-to-scaled score lookup, per test form per section. Composite score is computed at finalize time as the rounded mean of the four section scaled scores and is not stored here.';
