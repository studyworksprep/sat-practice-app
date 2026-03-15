-- 1. Question availability summary table
-- Precomputed counts of available questions by domain, skill, and difficulty.
-- This is static data that only changes when questions are added/removed.
-- Replaces full question_taxonomy table scans in teacher student dashboard.
CREATE TABLE IF NOT EXISTS public.question_availability (
  domain_name text NOT NULL,
  skill_name text NOT NULL,
  difficulty integer NOT NULL DEFAULT 0,
  question_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (domain_name, skill_name, difficulty)
);

-- Populate from question_taxonomy
INSERT INTO public.question_availability (domain_name, skill_name, difficulty, question_count)
SELECT
  COALESCE(domain_name, 'Unknown') AS domain_name,
  COALESCE(skill_name, 'Unknown') AS skill_name,
  COALESCE(difficulty, 0) AS difficulty,
  COUNT(DISTINCT question_id) AS question_count
FROM public.question_taxonomy
GROUP BY COALESCE(domain_name, 'Unknown'), COALESCE(skill_name, 'Unknown'), COALESCE(difficulty, 0)
ON CONFLICT (domain_name, skill_name, difficulty) DO UPDATE
  SET question_count = EXCLUDED.question_count;

-- Also store a total row per domain+skill (difficulty=0 means "all")
INSERT INTO public.question_availability (domain_name, skill_name, difficulty, question_count)
SELECT
  COALESCE(domain_name, 'Unknown') AS domain_name,
  COALESCE(skill_name, 'Unknown') AS skill_name,
  0 AS difficulty,
  COUNT(DISTINCT question_id) AS question_count
FROM public.question_taxonomy
WHERE difficulty IS NOT NULL AND difficulty > 0
GROUP BY COALESCE(domain_name, 'Unknown'), COALESCE(skill_name, 'Unknown')
ON CONFLICT (domain_name, skill_name, difficulty) DO UPDATE
  SET question_count = EXCLUDED.question_count;

-- RLS: allow all authenticated users to read
ALTER TABLE public.question_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read question_availability"
  ON public.question_availability FOR SELECT
  TO authenticated
  USING (true);

-- 2. Cache computed scores on practice_test_attempts
-- Store composite and section scores when a test is completed,
-- so dashboard routes don't need to recompute from module data + score_conversion.
ALTER TABLE public.practice_test_attempts
  ADD COLUMN IF NOT EXISTS composite_score integer,
  ADD COLUMN IF NOT EXISTS rw_scaled integer,
  ADD COLUMN IF NOT EXISTS math_scaled integer;
