-- =========================================================
-- Open questions_v2.source to arbitrary values
-- =========================================================
-- The admin question-authoring page now lets writers pick from
-- existing sources or add a new one on the fly. That flexibility
-- is incompatible with a fixed CHECK allowlist (each new source
-- would otherwise need a schema migration).
--
-- Drop the `questions_v2_source_check` constraint entirely.
-- Sources remain NOT NULL and continue to default to 'generated';
-- validation of the string itself now lives in the app layer
-- (lib/api/... / the createQuestion Server Action).
--
-- Additive + idempotent; no existing rows change.

ALTER TABLE public.questions_v2
  DROP CONSTRAINT IF EXISTS questions_v2_source_check;

-- PostgREST reload so the relaxed constraint is picked up promptly.
NOTIFY pgrst, 'reload schema';
