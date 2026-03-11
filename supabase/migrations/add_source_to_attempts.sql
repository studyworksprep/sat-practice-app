-- Add source column to attempts table to distinguish where attempts come from.
-- Values: 'practice' (filter page / assignments), 'practice_test', 'review' (dashboard replay / review page)
-- Defaults to 'practice' for backwards compatibility with existing rows.
alter table public.attempts
  add column if not exists source text not null default 'practice';
