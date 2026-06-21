-- Stage E follow-up #2: retire the v1 answer_options reader.
--
-- Legacy Bluebook imports populated attempts.selected_option_id
-- (a v1 answer_options uuid) and left response_text NULL. The
-- v2 review loader compensated by reading answer_options.label
-- to recover the chosen letter. That fallback was the last app-
-- code reader of the v1 answer_options table.
--
-- This migration:
--   1. Backfills response_text from answer_options.label for every
--      SAT attempts row in that legacy shape (10,417 rows in prod,
--      all of which resolve cleanly — 0 unrecoverable).
--   2. Nulls out attempts.selected_option_id for every SAT row
--      that still has it set. The v2 contract is that response_text
--      carries the MCQ letter; selected_option_id is dead weight.
--      Stage E-3 closed the last writer of this column on May 31,
--      so no in-flight code will refill it.
--
-- ACT lives in act_attempts (different table); its selected_option_id
-- is a real FK to act_answer_options and is untouched.

update public.attempts as a
set response_text = upper(o.label)
from public.answer_options o
where a.selected_option_id = o.id
  and a.response_text is null
  and o.label is not null;

update public.attempts
set selected_option_id = null
where selected_option_id is not null;
