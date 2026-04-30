-- Mark-for-review on practice sessions.
--
-- Self-guided practice didn't have a mark-for-review feature, so
-- the assignment + practice review reports' question map showed
-- gold flag badges only for practice-test attempts (which have
-- their own marked_for_review column on practice_test_item_attempts_v2).
--
-- Storing marked positions on the session row keeps the data
-- model dead simple — the session already owns question_ids[],
-- current_position, and draft_answers; this is the same shape:
-- a tiny per-position state vector that doesn't deserve its own
-- table.
--
-- int[] (positions, 0-indexed) rather than question_id[] so the
-- v1↔v2 id translation isn't a concern and so reordering a
-- session (which doesn't happen today, but the data model
-- doesn't forbid it) wouldn't silently un-mark questions.

alter table public.practice_sessions
  add column if not exists marked_positions int[] not null default '{}';
