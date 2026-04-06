-- Add test_type column to sat_official_scores (SAT, PSAT, or NULL for legacy rows)
ALTER TABLE public.sat_official_scores
  ADD COLUMN IF NOT EXISTS test_type text DEFAULT 'SAT';
