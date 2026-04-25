-- ============================================================
-- Mark-for-review flag on practice-test item attempts.
--
-- The Bluebook-style runner lets a student flag a question during
-- a module so the module-end review grid can highlight it. The
-- flag is per-attempt (resets across attempts) and per-question,
-- which matches the row granularity of
-- practice_test_item_attempts_v2 exactly — no separate table.
--
-- Default false. The runner writes a row to this table for every
-- question the student touches (answers or flags), so the column
-- gets its value either way.
-- ============================================================

alter table public.practice_test_item_attempts_v2
  add column if not exists marked_for_review boolean not null default false;

-- Index the flag so the module-end review grid can find flagged
-- items quickly. Partial index because almost all rows have the
-- flag = false.
create index if not exists idx_ptia_v2_flagged
  on public.practice_test_item_attempts_v2 (practice_test_module_attempt_id)
  where marked_for_review = true;

-- Let PostgREST notice the new column without a restart.
notify pgrst, 'reload schema';
