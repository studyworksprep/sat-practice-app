-- Add subject / domain / skill metadata to student_notes.
--
-- Auto-populated from the linked question on insert/update by the
-- Server Action (see app/next/(student)/notes/actions.ts), but the
-- student can override / set them on standalone notes (no
-- question_id) too. All columns are nullable: a note that's neither
-- linked nor manually classified just shows up as "uncategorized" in
-- the index sidebar.
--
-- subject_code is the SAT section, normalized to 'rw' | 'math' (the
-- value domainSection() in lib/ui/question-layout.js returns).
-- domain_code/skill_code mirror questions_v2's columns verbatim.

alter table public.student_notes
  add column if not exists subject_code text,
  add column if not exists domain_code  text,
  add column if not exists domain_name  text,
  add column if not exists skill_code   text,
  add column if not exists skill_name   text;

-- Sidebar filters in /notes hit these three columns with .eq().
-- Composite index keeps the common (user, subject, domain, skill)
-- pattern fast without one index per column.
create index if not exists student_notes_user_taxonomy_idx
  on public.student_notes (user_id, subject_code, domain_code, skill_code);
