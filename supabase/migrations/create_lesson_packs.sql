-- =========================================================
-- Lesson packs: tutor-curated, ordered question collections
-- =========================================================
-- A pack is a private collection owned by one tutor. The tutor
-- builds it in /tutor/lesson-packs/<id> by searching the
-- questions_v2 bank, adding individual rows, and reordering
-- them. Packs are not yet wired into assignments_v2 — that is a
-- follow-up.
--
-- Two tables:
--   lesson_packs            — metadata + ownership
--   lesson_pack_questions   — junction with explicit ordering
--
-- RLS: owner-only for tutors; admins see everything (mirrors the
-- questions_v2 policy split).

-- ─── lesson_packs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lesson_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lesson_packs_teacher
  ON public.lesson_packs (teacher_id, updated_at DESC);

-- ─── lesson_pack_questions ────────────────────────────────
-- Composite PK (pack_id, question_id) prevents a question from
-- appearing twice in the same pack. `position` carries the
-- explicit order; reorders rewrite the column, not the row keys.
CREATE TABLE IF NOT EXISTS public.lesson_pack_questions (
  pack_id uuid NOT NULL REFERENCES public.lesson_packs(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions_v2(id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position >= 0),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pack_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_pack_questions_pack_position
  ON public.lesson_pack_questions (pack_id, position);

-- ─── updated_at trigger on lesson_packs ───────────────────
CREATE OR REPLACE FUNCTION public.tg_lesson_packs_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_packs_touch_updated_at ON public.lesson_packs;
CREATE TRIGGER lesson_packs_touch_updated_at
  BEFORE UPDATE ON public.lesson_packs
  FOR EACH ROW EXECUTE FUNCTION public.tg_lesson_packs_touch_updated_at();

-- Touch the parent pack whenever its contents change, so the
-- tutor's "recently edited" sort on the list view stays useful.
CREATE OR REPLACE FUNCTION public.tg_lesson_pack_questions_touch_pack()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.lesson_packs
     SET updated_at = now()
   WHERE id = COALESCE(NEW.pack_id, OLD.pack_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS lesson_pack_questions_touch_pack
  ON public.lesson_pack_questions;
CREATE TRIGGER lesson_pack_questions_touch_pack
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_pack_questions
  FOR EACH ROW EXECUTE FUNCTION public.tg_lesson_pack_questions_touch_pack();

-- ─── RLS ──────────────────────────────────────────────────
ALTER TABLE public.lesson_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_pack_questions ENABLE ROW LEVEL SECURITY;

-- Owners: full access to their own packs.
DROP POLICY IF EXISTS lesson_packs_owner_all ON public.lesson_packs;
CREATE POLICY lesson_packs_owner_all ON public.lesson_packs
  FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Admins: full access to every pack (support / debugging).
DROP POLICY IF EXISTS lesson_packs_admin_all ON public.lesson_packs;
CREATE POLICY lesson_packs_admin_all ON public.lesson_packs
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Junction rows visible/editable iff the caller can see the parent
-- pack. The EXISTS subquery walks lesson_packs, which itself is
-- RLS-protected, so the policy collapses to "owner or admin"
-- without us re-stating the logic.
DROP POLICY IF EXISTS lesson_pack_questions_owner_all ON public.lesson_pack_questions;
CREATE POLICY lesson_pack_questions_owner_all ON public.lesson_pack_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_packs p
       WHERE p.id = lesson_pack_questions.pack_id
         AND p.teacher_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lesson_packs p
       WHERE p.id = lesson_pack_questions.pack_id
         AND p.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS lesson_pack_questions_admin_all ON public.lesson_pack_questions;
CREATE POLICY lesson_pack_questions_admin_all ON public.lesson_pack_questions
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
