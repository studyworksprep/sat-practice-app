-- practice_test_attempts_v2.sections_only — single-section attempts.
--
-- A student can choose to sit only the R&W or only the Math half of
-- a practice test. NULL means a full attempt (both sections, current
-- behavior). The runner uses this to pick the first module on start
-- and to terminate after RW module 2 when sections_only='RW' (the
-- MATH-only path already terminates at MATH module 2). Scoring leaves
-- the absent section's *_scaled column NULL; compositeScore() returns
-- NULL when either side is NULL, so single-section attempts naturally
-- carry a NULL composite.
--
-- Legacy parity: the legacy tree's practice_test_attempts.metadata
-- jsonb carried this as {sections: 'rw'|'math'|'both'}. The v2 schema
-- dropped the metadata column; this is the durable replacement,
-- normalized to the uppercase subject_code values used everywhere
-- else in v2.

alter table public.practice_test_attempts_v2
  add column if not exists sections_only text;

alter table public.practice_test_attempts_v2
  drop constraint if exists practice_test_attempts_v2_sections_only_check;

alter table public.practice_test_attempts_v2
  add constraint practice_test_attempts_v2_sections_only_check
  check (sections_only is null or sections_only in ('RW', 'MATH'));
