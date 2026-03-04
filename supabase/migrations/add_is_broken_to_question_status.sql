-- Add is_broken flag to question_status
-- Run this in the Supabase SQL editor or via the Supabase CLI.
alter table question_status
  add column if not exists is_broken boolean not null default false;
