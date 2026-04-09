-- =========================================================
-- Phase 5: approval audit columns for questions_v2
-- =========================================================
-- Adds two audit columns the admin Questions V2 Preview tab uses to
-- track which questions have been reviewed and signed off:
--
--   approved_at  timestamptz  -- when the admin approved this row
--   approved_by  uuid         -- which admin approved it (→ auth.users)
--
-- Both are nullable; NULL means "not approved yet".  The preview
-- defaults to showing ONLY unapproved rows so admins can work
-- through a shrinking backlog, and exposes a counter of approved
-- rows at the top of the page.
--
-- Safe to run multiple times.

ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.questions_v2.approved_at IS
  'Timestamp of the most recent admin approval for this row. NULL = not approved.';
COMMENT ON COLUMN public.questions_v2.approved_by IS
  'auth.users.id of the admin who approved this row.';

-- Partial index so the preview can efficiently list unapproved rows
-- in display_code order (the default view).
CREATE INDEX IF NOT EXISTS idx_questions_v2_unapproved
  ON public.questions_v2 (display_code)
  WHERE approved_at IS NULL;
