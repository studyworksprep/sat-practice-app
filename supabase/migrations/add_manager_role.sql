-- Add 'manager' to the profiles role check constraint
-- Manager has Teacher permissions + access to the Teachers tab

ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('practice', 'student', 'teacher', 'manager', 'admin'));

-- Update the is_teacher() helper function to include manager
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
  );
$$;

-- Update RLS policies on sat_registrations that check for teacher/admin
DROP POLICY IF EXISTS "Teachers can view assigned student registrations" ON sat_registrations;
CREATE POLICY "Teachers can view assigned student registrations"
  ON sat_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can insert registrations for assigned students" ON sat_registrations;
CREATE POLICY "Teachers can insert registrations for assigned students"
  ON sat_registrations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete registrations for assigned students" ON sat_registrations;
CREATE POLICY "Teachers can delete registrations for assigned students"
  ON sat_registrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

-- Update RLS policies on sat_scores that check for teacher/admin
DROP POLICY IF EXISTS "Teachers can view assigned student scores" ON sat_scores;
CREATE POLICY "Teachers can view assigned student scores"
  ON sat_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can insert scores for assigned students" ON sat_scores;
CREATE POLICY "Teachers can insert scores for assigned students"
  ON sat_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete scores" ON sat_scores;
CREATE POLICY "Teachers can delete scores"
  ON sat_scores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );
