-- =========================================================
-- act_practice_test_attempts — per-attempt cached scores
-- =========================================================
-- See docs/architecture-plan.md §3.4 "ACT practice tests as
-- virtual constructs."
--
-- ACT has no 7-table practice-test family (no module routing, no
-- adaptive logic, no item-attempts table); every ACT question
-- already carries source_test + source_ordinal, so an "ACT
-- practice test" is the deterministic slice
--
--   from act_questions where source_test = X order by source_ordinal
--
-- run through the shared practice_sessions runner. This table is
-- the one piece of state that *does* need to persist beyond the
-- session: per-attempt scaled scores so dashboard renders don't
-- recompute from act_attempts on every visit, and so the student's
-- practice-test history is a fast list lookup.
--
-- Mirrors practice_test_attempts_v2 (SAT) at the metadata level:
-- one row per attempt, scores set at finalize, status transitions
-- in_progress → completed.

create table if not exists public.act_practice_test_attempts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- The ACT test form this attempt covers, e.g. "ACT 2023 April
  -- Form A". Matches act_questions.source_test exactly; the runner
  -- selects act_questions where source_test = this column.
  source_test           text not null,

  -- in_progress → completed. Cancelled attempts are deleted, not
  -- left in a third state, matching the SAT practice-test pattern.
  status                text not null default 'in_progress'
                          check (status in ('in_progress', 'completed')),

  started_at            timestamptz not null default now(),
  finished_at           timestamptz,

  -- Scaled section + composite scores on the 1-36 ACT scale.
  -- Populated by the finalize action when status flips to
  -- 'completed'; null while in_progress. Composite is the
  -- rounded average of the four section scales (standard ACT
  -- rule), persisted here so dashboards don't recompute.
  english_scaled        int check (english_scaled  between 1 and 36),
  math_scaled           int check (math_scaled     between 1 and 36),
  reading_scaled        int check (reading_scaled  between 1 and 36),
  science_scaled        int check (science_scaled  between 1 and 36),
  composite_score       int check (composite_score between 1 and 36),

  -- Convenience link to the shared practice_sessions row that
  -- carries the question_ids[] + current_position state. Nullable
  -- so we can hard-delete an old session without breaking the
  -- historical attempt record.
  practice_session_id   uuid references public.practice_sessions(id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists act_practice_test_attempts_user_started_idx
  on public.act_practice_test_attempts (user_id, started_at desc);

create index if not exists act_practice_test_attempts_session_idx
  on public.act_practice_test_attempts (practice_session_id)
  where practice_session_id is not null;

-- RLS mirrors practice_test_attempts_v2 (see
-- 20240101000014_create_practice_test_v2_schema.sql): owner can
-- write; can_view(target) gates reads so tutors / managers /
-- admins see their visible students' attempts; only admins delete.

alter table public.act_practice_test_attempts enable row level security;

drop policy if exists act_pta_select       on public.act_practice_test_attempts;
drop policy if exists act_pta_insert_self  on public.act_practice_test_attempts;
drop policy if exists act_pta_update_self  on public.act_practice_test_attempts;
drop policy if exists act_pta_admin_delete on public.act_practice_test_attempts;

create policy act_pta_select on public.act_practice_test_attempts
  for select to public using (public.can_view(user_id));

create policy act_pta_insert_self on public.act_practice_test_attempts
  for insert to public with check (user_id = auth.uid() or public.is_admin());

create policy act_pta_update_self on public.act_practice_test_attempts
  for update to public
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy act_pta_admin_delete on public.act_practice_test_attempts
  for delete to public using (public.is_admin());
