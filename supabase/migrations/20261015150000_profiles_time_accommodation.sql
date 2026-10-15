-- =========================================================
-- Standing extended-time accommodation (student test surfaces, 2026-10-15)
-- =========================================================
-- One setting per student, applied by default to every timed practice
-- test: the SAT launch page and compact launcher pre-select it, the ACT
-- hub's timing select starts on it, and starts that offer no choice (an
-- ACT practice-test assignment) use it outright. A launch surface may
-- still override it per attempt; practice_test_attempts_v2.time_multiplier
-- and act_practice_test_attempts.time_multiplier keep recording what an
-- attempt actually ran with, so results stay honest about the clock.
--
-- Students edit it on /account (RLS already lets a student update their
-- own profile row); tutors through updateStudentProfile's allowlist.

alter table public.profiles
  add column if not exists time_accommodation numeric(2,1) not null default 1
    check (time_accommodation in (1, 1.5, 2));

comment on column public.profiles.time_accommodation is
  'Standing extended-time accommodation for timed practice tests: 1 (standard), 1.5 or 2. Default for the SAT launch page, the ACT hub and assignment-started ACT tests; each attempt stores the multiplier it ran with.';
