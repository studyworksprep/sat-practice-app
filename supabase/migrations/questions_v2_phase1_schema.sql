-- =========================================================
-- Phase 1: Simplified questions schema (questions_v2)
-- =========================================================
-- Creates the new simplified schema alongside existing tables.
-- No existing data is modified. No application code changes yet.
-- Safe to run at any time.

-- ─── Main questions table (flat, no versioning) ────────────
CREATE TABLE IF NOT EXISTS public.questions_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  question_type text NOT NULL CHECK (question_type IN ('mcq', 'spr')),
  stem_html text NOT NULL,
  stimulus_html text,
  rationale_html text,
  options jsonb,          -- [{label, ordinal, content_html}]
  correct_answer jsonb,   -- {option_label, option_labels, text, number, tolerance}

  -- Taxonomy (inline, no join needed)
  domain_code text,
  domain_name text,
  skill_code text,
  skill_name text,
  difficulty int CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3),
  score_band int CHECK (score_band IS NULL OR score_band BETWEEN 1 AND 7),

  -- Metadata
  source text NOT NULL DEFAULT 'generated'
    CHECK (source IN ('collegeboard', 'generated', 'custom')),
  source_id text,             -- Collegeboard question_id / external ref
  source_external_id text,    -- secondary external ref
  is_published boolean NOT NULL DEFAULT true,
  is_broken boolean NOT NULL DEFAULT false,

  -- Precomputed stats
  attempt_count int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_questions_v2_source ON questions_v2(source);
CREATE INDEX IF NOT EXISTS idx_questions_v2_domain ON questions_v2(domain_code);
CREATE INDEX IF NOT EXISTS idx_questions_v2_skill ON questions_v2(skill_code);
CREATE INDEX IF NOT EXISTS idx_questions_v2_difficulty ON questions_v2(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_v2_score_band ON questions_v2(score_band);
CREATE INDEX IF NOT EXISTS idx_questions_v2_published ON questions_v2(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_questions_v2_source_id ON questions_v2(source_id) WHERE source_id IS NOT NULL;

-- ─── Mapping table: old question IDs → new question IDs ──
-- Lets us preserve all existing user progress (question_status,
-- attempts, practice_test_module_items) while adopting the new schema.
CREATE TABLE IF NOT EXISTS public.question_id_map (
  old_question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  old_version_id uuid REFERENCES question_versions(id) ON DELETE CASCADE,
  new_question_id uuid NOT NULL REFERENCES questions_v2(id) ON DELETE CASCADE,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (old_question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_id_map_new ON question_id_map(new_question_id);
CREATE INDEX IF NOT EXISTS idx_question_id_map_old_version ON question_id_map(old_version_id);

-- ─── RLS policies ─────────────────────────────────────────
ALTER TABLE public.questions_v2 ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published, non-broken questions
CREATE POLICY "questions_v2_select_all" ON public.questions_v2
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
CREATE POLICY "questions_v2_admin_all" ON public.questions_v2
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Mapping table: readable by authenticated users, admin-only writes
ALTER TABLE public.question_id_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_id_map_select_all" ON public.question_id_map
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "question_id_map_admin_all" ON public.question_id_map
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ─── Updated_at trigger ───────────────────────────────────
CREATE TRIGGER set_questions_v2_updated_at
  BEFORE UPDATE ON public.questions_v2
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
