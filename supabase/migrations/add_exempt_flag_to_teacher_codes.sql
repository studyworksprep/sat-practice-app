-- Add exempt flag to teacher_codes to distinguish Studyworks codes
-- from external teacher codes. Only exempt codes grant free access.
ALTER TABLE public.teacher_codes
  ADD COLUMN IF NOT EXISTS exempt boolean NOT NULL DEFAULT false;

-- Mark all existing teacher codes as exempt (they're all Studyworks codes)
UPDATE public.teacher_codes SET exempt = true WHERE exempt = false;
