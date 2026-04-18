-- Phase 3 — drop the answer-choice tag system.
--
-- Two tables existed to tag individual answer options with
-- descriptive labels (e.g., "common misconception distractor").
-- Production has ~5 tagged rows total; none proved useful. The
-- system is scrapped.
--
-- If a per-student "tag the trap" feature is built later, it would
-- be a different shape (per-student, per-attempt, not per-option).
--
-- These tables are still referenced by legacy code but have no data
-- of value. Safe to drop; the legacy code will fail silently on the
-- empty result rather than crash.

drop table if exists public.option_answer_choice_tags;
drop table if exists public.answer_choice_tags;
