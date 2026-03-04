-- Add rationale_html to question_versions for per-question explanations
-- Run in the Supabase SQL editor or via the Supabase CLI.
alter table question_versions
  add column if not exists rationale_html text;
