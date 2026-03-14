-- =========================================================
-- Fix infinite recursion in profiles RLS policy
-- =========================================================
-- Problem: Several RLS policies on other tables directly query the profiles
-- table (e.g., EXISTS (SELECT 1 FROM profiles WHERE ...)), which triggers
-- the profiles_select RLS policy, which in turn queries those tables,
-- causing infinite recursion (PostgreSQL error 42P17).
--
-- Solution: Replace all direct profiles queries in RLS policies with
-- JWT-based checks using auth.jwt() -> 'app_metadata' ->> 'role'.
-- This requires syncing the role from profiles to auth.users.raw_app_meta_data.

-- 1) Sync existing users' roles to JWT app_metadata
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.profiles p
WHERE u.id = p.id;

-- 2) Keep roles synced via trigger on profiles
CREATE OR REPLACE FUNCTION public.sync_role_to_auth_metadata()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_role_trigger ON public.profiles;
CREATE TRIGGER sync_role_trigger
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_role_to_auth_metadata();

-- 3) Rewrite is_admin() and is_teacher() to use JWT instead of querying profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin');
$$;

-- 4) Fix manager_teacher_assignments admin policy (was directly querying profiles)
DROP POLICY IF EXISTS "Admins manage all manager-teacher assignments" ON public.manager_teacher_assignments;
CREATE POLICY "Admins manage all manager-teacher assignments"
  ON public.manager_teacher_assignments
  FOR ALL USING (public.is_admin());

-- 5) Fix sat_test_registrations policies (were directly querying profiles)
DROP POLICY IF EXISTS "Teachers can insert registrations for assigned students" ON public.sat_test_registrations;
CREATE POLICY "Teachers can insert registrations for assigned students" ON public.sat_test_registrations
  FOR INSERT WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "Teachers can delete registrations for assigned students" ON public.sat_test_registrations;
CREATE POLICY "Teachers can delete registrations for assigned students" ON public.sat_test_registrations
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

-- 6) Fix sat_official_scores policies (were directly querying profiles)
DROP POLICY IF EXISTS "Teachers can insert scores for assigned students" ON public.sat_official_scores;
CREATE POLICY "Teachers can insert scores for assigned students" ON public.sat_official_scores
  FOR INSERT WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "Teachers can delete scores" ON public.sat_official_scores;
CREATE POLICY "Teachers can delete scores" ON public.sat_official_scores
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );
