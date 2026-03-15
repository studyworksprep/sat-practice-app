-- Add 'manager' to the profiles role check constraint
-- Manager has Teacher permissions + access to the Teachers tab

-- The constraint may be named profiles_role_check or use the ANY(ARRAY[...]) syntax.
-- Drop whichever exists, then recreate.
DO $$
BEGIN
  -- Try dropping named constraint first
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- constraint doesn't exist by this name
  END;

  -- Try dropping the auto-generated check constraint name
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check1;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END$$;

-- Drop any remaining check constraints on role column and recreate
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['practice'::text, 'student'::text, 'teacher'::text, 'manager'::text, 'admin'::text]));

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
