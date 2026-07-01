-- Allow the lesson_complete block type — a terminal block that ends a
-- lesson with a "Complete Lesson" button (at most one, always last).
-- Keeps existing valid values and appends lesson_complete.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname
  INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'lesson_blocks'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%block_type%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lesson_blocks DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.lesson_blocks
  ADD CONSTRAINT lesson_blocks_block_type_check
  CHECK (block_type IN ('text', 'video', 'check', 'question_link', 'desmos_interactive', 'lesson_complete'));
