-- =========================================================
-- Phase 3: user-friendly display codes for questions_v2
-- =========================================================
-- Adds a `display_code` column to questions_v2 that gives every
-- question a short, human-readable id such as `M-00153` (Math) or
-- `RW-00042` (Reading & Writing).  Format:  <prefix>-<5-digit zero-
-- padded sequence>.  5 digits means up to 99,999 questions per
-- section.
--
-- Prefix is derived from the SAT domain code already stored in
-- questions_v2.domain_code.  The same mapping is used throughout the
-- app (see app/practice/[questionId]/page.js, app/dashboard/*).
--
--   Math  ('H','P','S','Q')         → M
--   R & W ('EOI','INI','CAS','SEC') → RW
--
-- Numbers are handed out by two Postgres sequences so inserts are
-- atomic and race-free.  A BEFORE INSERT trigger populates
-- display_code on every new row (unless the caller already set one),
-- so migrate_questions_batch() does NOT need to change.  A separate
-- helper function backfills any rows that already exist.
--
-- Safe to run multiple times.  After running this file, call:
--   SELECT public.backfill_questions_v2_display_codes();
-- to assign codes to rows migrated under phase 2.

-- ─── 1. Column ────────────────────────────────────────────
ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS display_code text;

COMMENT ON COLUMN public.questions_v2.display_code IS
  'User-friendly id in the form <M|RW>-NNNNN (e.g. M-00153). Unique, assigned automatically on insert via a BEFORE INSERT trigger.';

-- ─── 2. Per-section sequences ─────────────────────────────
-- int is 2^31-1 ≈ 2.1 billion, comfortably more than the 99,999
-- ceiling implied by the 5-digit format.
CREATE SEQUENCE IF NOT EXISTS public.questions_v2_math_seq AS int START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.questions_v2_rw_seq   AS int START WITH 1 MINVALUE 1;

-- ─── 3. Helper: domain_code → section prefix ──────────────
CREATE OR REPLACE FUNCTION public.questions_v2_section_prefix(domain_code text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(domain_code, ''))
    WHEN 'H'   THEN 'M'
    WHEN 'P'   THEN 'M'
    WHEN 'S'   THEN 'M'
    WHEN 'Q'   THEN 'M'
    WHEN 'EOI' THEN 'RW'
    WHEN 'INI' THEN 'RW'
    WHEN 'CAS' THEN 'RW'
    WHEN 'SEC' THEN 'RW'
    ELSE NULL
  END;
$$;

-- ─── 4. BEFORE INSERT trigger ─────────────────────────────
-- Populates NEW.display_code if it's NULL. Questions with no
-- recognised section prefix (e.g. domain_code is NULL) are left
-- with display_code = NULL and can be backfilled later once the
-- taxonomy is set.
CREATE OR REPLACE FUNCTION public.questions_v2_set_display_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
  num int;
BEGIN
  IF NEW.display_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  prefix := public.questions_v2_section_prefix(NEW.domain_code);
  IF prefix IS NULL THEN
    RETURN NEW;
  END IF;

  IF prefix = 'M' THEN
    num := nextval('public.questions_v2_math_seq');
  ELSIF prefix = 'RW' THEN
    num := nextval('public.questions_v2_rw_seq');
  ELSE
    RETURN NEW;
  END IF;

  NEW.display_code := prefix || '-' || lpad(num::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_questions_v2_set_display_code ON public.questions_v2;
CREATE TRIGGER trg_questions_v2_set_display_code
  BEFORE INSERT ON public.questions_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.questions_v2_set_display_code();

-- ─── 5. Backfill existing rows ────────────────────────────
-- Rows migrated under phase 2 pre-date the trigger, so their
-- display_code is NULL.  Assign codes in created_at order (then id
-- as a tiebreaker) so the numbering tracks migration order.
-- Idempotent: rows that already have a display_code are skipped.
CREATE OR REPLACE FUNCTION public.backfill_questions_v2_display_codes()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  prefix text;
  num int;
  updated_count int := 0;
BEGIN
  FOR rec IN
    SELECT id, domain_code
    FROM questions_v2
    WHERE display_code IS NULL
      AND questions_v2_section_prefix(domain_code) IS NOT NULL
    ORDER BY created_at, id
  LOOP
    prefix := questions_v2_section_prefix(rec.domain_code);
    IF prefix = 'M' THEN
      num := nextval('questions_v2_math_seq');
    ELSIF prefix = 'RW' THEN
      num := nextval('questions_v2_rw_seq');
    ELSE
      CONTINUE;
    END IF;

    UPDATE questions_v2
    SET display_code = prefix || '-' || lpad(num::text, 5, '0')
    WHERE id = rec.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

-- ─── 6. Uniqueness and lookup index ───────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_v2_display_code_unique
  ON public.questions_v2 (display_code)
  WHERE display_code IS NOT NULL;
