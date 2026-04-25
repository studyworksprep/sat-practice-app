-- Allow desmos_interactive lesson block type.
-- Keeps existing valid values and appends desmos_interactive.

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
  CHECK (block_type IN ('text', 'video', 'check', 'question_link', 'desmos_interactive'));
