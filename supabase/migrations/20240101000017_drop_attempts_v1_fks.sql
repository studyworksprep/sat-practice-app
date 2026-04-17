-- Drop the legacy v1 FKs on public.attempts so the table can
-- reference v2 question UUIDs (which are in questions_v2, not
-- the v1 questions table) and store option codes ('A'/'B'/...) in
-- text instead of uuids pointing at answer_options.
--
-- The attempts table remains the authoritative record of every
-- question answer across the platform. Its question_id column now
-- carries the v2 UUID directly. Old v1-era rows still have v1 UUIDs
-- in the column; they remain valid, just without FK enforcement.
--
-- selected_option_id becomes vestigial for v2 attempts (v2 stores
-- the option code 'A'/'B'/... in response_text instead). Keeping
-- the column for v1 backwards compatibility.

alter table public.attempts
  drop constraint if exists attempts_question_id_fkey;

alter table public.attempts
  drop constraint if exists attempts_selected_option_id_fkey;

-- question_status has a similar FK. Drop it for the same reason.
alter table public.question_status
  drop constraint if exists question_status_question_id_fkey;
