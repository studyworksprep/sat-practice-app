-- ============================================================
-- Accommodation support on practice test attempts.
--
-- A student who qualifies for extended time gets a multiplier
-- (1.5x, 2x, etc.) applied to every module's time limit for an
-- attempt. Stored per attempt rather than per user profile so
-- teachers can opt in per test and so we don't have to migrate
-- a flag across the profile table.
--
-- Numeric (3,2) gives us 0.01 precision up to 9.99x, which is
-- enough. Default 1.0 for everyone; existing rows become 1.0
-- implicitly.
-- ============================================================

alter table public.practice_test_attempts_v2
  add column if not exists time_multiplier numeric(3,2) not null default 1.0
    check (time_multiplier >= 1.0 and time_multiplier <= 3.0);

-- Let PostgREST pick up the column.
notify pgrst, 'reload schema';
