-- =========================================================
-- Fix scrambled ACT answer-option ordinals
-- =========================================================
-- The 2024-Sep and 2025-Oct math imports set every answer
-- option's `ordinal` to the parent question's source_ordinal
-- instead of a per-option 1/2/3/4. With four rows tying on
-- the sort column, Postgres returned them in arbitrary order
-- and the runner rendered labels like A,D,C,B / D,A,B,C.
--
-- Grading was unaffected (act_attempts.selected_option_id is
-- a real FK), but the display order made tutoring conversations
-- ("look at choice B…") refer to the wrong row.
--
-- Fix: for any question whose options have duplicate ordinals,
-- rewrite ordinal from the label (A→1, B→2, C→3, D→4). All
-- ACT options today carry an A/B/C/D label (no F/G/H/J yet);
-- ELSE leaves anything unexpected untouched.

WITH affected AS (
  SELECT question_id
  FROM public.act_answer_options
  GROUP BY question_id
  HAVING COUNT(DISTINCT ordinal) < COUNT(*)
)
UPDATE public.act_answer_options o
SET ordinal = CASE o.label
  WHEN 'A' THEN 1
  WHEN 'B' THEN 2
  WHEN 'C' THEN 3
  WHEN 'D' THEN 4
  ELSE o.ordinal
END
WHERE o.question_id IN (SELECT question_id FROM affected);
