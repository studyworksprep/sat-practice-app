-- Add banned_at to profiles so the admin Status column can distinguish
-- a manually archived user (is_active=false) from one removed for a
-- terms-of-service violation. Active = is_active!=false AND banned_at
-- IS NULL; Inactive = is_active=false AND banned_at IS NULL; Banned =
-- banned_at IS NOT NULL (overrides is_active).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banned_at timestamptz;

CREATE INDEX IF NOT EXISTS profiles_banned_at_idx
  ON public.profiles (banned_at)
  WHERE banned_at IS NOT NULL;
