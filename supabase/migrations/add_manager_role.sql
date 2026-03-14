-- Add 'manager' to the profiles role check constraint
-- Manager has Teacher permissions + access to the Teachers tab

ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('practice', 'student', 'teacher', 'manager', 'admin'));

-- Update the is_teacher() helper function to include manager (if it exists)
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
  );
$$;
