-- Add a unique invite code to teacher profiles.
-- Students can enter this code during signup to be auto-assigned to the teacher.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_invite_code text UNIQUE;

-- Index for fast lookup during student signup
CREATE INDEX IF NOT EXISTS idx_profiles_teacher_invite_code
  ON public.profiles (teacher_invite_code)
  WHERE teacher_invite_code IS NOT NULL;
