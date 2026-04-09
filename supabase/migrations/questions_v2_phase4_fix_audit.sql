-- =========================================================
-- Phase 4: Claude-fix audit columns for questions_v2
-- =========================================================
-- Adds two audit columns used by the "Fix with Claude" flow in the
-- admin Questions V2 Preview tab:
--
--   last_fixed_at  timestamptz  -- when Claude-cleaned HTML was saved
--   last_fixed_by  uuid         -- which admin saved it (→ auth.users)
--
-- Both are nullable.  A partial index on last_fixed_at IS NULL lets
-- the preview efficiently surface the backlog of unfixed questions.
--
-- Safe to run multiple times.

ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS last_fixed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fixed_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.questions_v2.last_fixed_at IS
  'Timestamp of the most recent Claude-driven HTML cleanup saved for this row.';
COMMENT ON COLUMN public.questions_v2.last_fixed_by IS
  'auth.users.id of the admin who saved the most recent Claude-driven HTML cleanup.';

-- Partial index: fast "unfixed first" ordering in the admin preview.
CREATE INDEX IF NOT EXISTS idx_questions_v2_unfixed
  ON public.questions_v2 (created_at)
  WHERE last_fixed_at IS NULL;
