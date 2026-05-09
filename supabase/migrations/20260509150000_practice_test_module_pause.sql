-- Practice-test "Save and exit" support.
--
-- Adds two columns to practice_test_module_attempts_v2:
--   paused_at           timestamptz — non-null while the student
--                       has paused the module via the runner's
--                       Save-and-exit button. Resume shifts
--                       started_at forward by (now - paused_at)
--                       and clears the column, so the timer
--                       picks up exactly where it left off.
--   paused_at_position  integer     — the question position the
--                       student was on when they paused. Used by
--                       the attempt-entry page to redirect them
--                       back to the same question on resume.
--
-- Both columns are nullable; existing rows keep working unchanged.
-- The runner / entry-page code treats paused_at IS NULL as "not
-- paused" so nothing breaks during the rollout.

alter table public.practice_test_module_attempts_v2
  add column if not exists paused_at          timestamptz,
  add column if not exists paused_at_position integer;
