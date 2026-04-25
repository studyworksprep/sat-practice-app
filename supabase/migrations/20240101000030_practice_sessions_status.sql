-- ============================================================
-- Lifecycle status on practice_sessions.
--
-- Until now, a session's "completion" was inferred three different
-- ways across the codebase (current_position >= length, count of
-- attempts since session.created_at, etc.). The review page saw
-- everything as in-progress because nothing explicitly flipped a
-- session closed. Adding a status column gives us a single
-- canonical signal:
--   in_progress — student is still working on it (default)
--   completed   — student hit Submit Set, or the runner fell off
--                 the end and redirected to the review report
--   abandoned   — student explicitly discarded the session
--
-- A backfill catches sessions that were effectively finished
-- pre-column: if current_position >= array_length(question_ids),
-- mark them completed so the review page doesn't show a stack of
-- old "in progress" rows on first load.
-- ============================================================

alter table public.practice_sessions
  add column if not exists status text not null default 'in_progress'
    check (status in ('in_progress', 'completed', 'abandoned'));

-- Backfill: sessions that ran off the end get rolled to completed.
update public.practice_sessions
set status = 'completed'
where status = 'in_progress'
  and current_position >= coalesce(jsonb_array_length(question_ids), 0)
  and jsonb_array_length(question_ids) > 0;

create index if not exists idx_practice_sessions_user_status
  on public.practice_sessions(user_id, status);

notify pgrst, 'reload schema';
