-- =========================================================
-- Allow source = 'studyworks' on questions_v2
-- =========================================================
-- The admin question-authoring page (app/next/(admin)/admin/
-- questions/new) writes questions composed in-house. Those rows
-- carry source = 'studyworks' so they're distinguishable from
-- imported CollegeBoard content, AI-'generated' rows, and one-off
-- 'custom' rows.
--
-- The original questions_v2 schema declared the source column with
-- an inline CHECK:
--   source text NOT NULL DEFAULT 'generated'
--     CHECK (source IN ('collegeboard', 'generated', 'custom'))
-- which Postgres auto-named questions_v2_source_check. This
-- migration drops that constraint and recreates it with
-- 'studyworks' added. Additive + idempotent; no existing rows
-- change. Safe to run at any time.

ALTER TABLE public.questions_v2
  DROP CONSTRAINT IF EXISTS questions_v2_source_check;

ALTER TABLE public.questions_v2
  ADD CONSTRAINT questions_v2_source_check
  CHECK (source IN ('collegeboard', 'generated', 'custom', 'studyworks'));

-- PostgREST reload so the relaxed constraint is picked up promptly.
NOTIFY pgrst, 'reload schema';
