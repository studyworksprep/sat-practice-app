-- =========================================================
-- Allow assignments_v2 to reference a lesson_pack.
-- =========================================================
-- The New Assignment form swaps its "Lesson" tab for "Lesson
-- Packs". A lesson-pack assignment behaves like a questions-type
-- assignment for the student runner — the pack's questions are
-- snapshotted into question_ids in position order at creation
-- time — but carries a lesson_pack_id reference so the source
-- pack is visible at a glance.
--
-- ON DELETE SET NULL: deleting a pack does not orphan historical
-- assignments. The question_ids snapshot stays valid; the link
-- back to the pack is just cleared.

ALTER TABLE public.assignments_v2
  ADD COLUMN IF NOT EXISTS lesson_pack_id uuid
    REFERENCES public.lesson_packs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_v2_lesson_pack
  ON public.assignments_v2 (lesson_pack_id)
  WHERE lesson_pack_id IS NOT NULL;

-- Extend the assignment_type CHECK to include 'lesson_pack'.
ALTER TABLE public.assignments_v2
  DROP CONSTRAINT IF EXISTS assignments_v2_assignment_type_check;
ALTER TABLE public.assignments_v2
  ADD CONSTRAINT assignments_v2_assignment_type_check
  CHECK (assignment_type = ANY (
    ARRAY['questions'::text, 'lesson'::text, 'practice_test'::text, 'lesson_pack'::text]
  ));

-- Extend the per-type required-field CHECK so a lesson_pack
-- row needs both its source pack id AND the materialized
-- question_ids snapshot. The runner reads question_ids; the
-- pack id is the human-facing source-of-truth marker.
ALTER TABLE public.assignments_v2
  DROP CONSTRAINT IF EXISTS assignments_v2_type_payload_present;
ALTER TABLE public.assignments_v2
  ADD CONSTRAINT assignments_v2_type_payload_present CHECK (
       (assignment_type = 'questions'     AND question_ids     IS NOT NULL)
    OR (assignment_type = 'lesson'        AND lesson_id        IS NOT NULL)
    OR (assignment_type = 'practice_test' AND practice_test_id IS NOT NULL)
    OR (assignment_type = 'lesson_pack'   AND lesson_pack_id   IS NOT NULL
                                          AND question_ids     IS NOT NULL)
  );
