-- Fix RLS policies for manager role
-- Managers need to: view assigned teacher profiles, manage scores/registrations for their students

-- 1) profiles SELECT: managers need to see their assigned teachers' profiles
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR teacher_can_view_student(id)
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = profiles.id
    )
  );

-- 2) sat_official_scores: add 'manager' to teacher role checks
DROP POLICY IF EXISTS "Teachers can insert scores for assigned students" ON sat_official_scores;
CREATE POLICY "Teachers can insert scores for assigned students" ON sat_official_scores
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete scores" ON sat_official_scores;
CREATE POLICY "Teachers can delete scores" ON sat_official_scores
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

-- 3) sat_test_registrations: add 'manager' to teacher role checks
DROP POLICY IF EXISTS "Teachers can insert registrations for assigned students" ON sat_test_registrations;
CREATE POLICY "Teachers can insert registrations for assigned students" ON sat_test_registrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete registrations for assigned students" ON sat_test_registrations;
CREATE POLICY "Teachers can delete registrations for assigned students" ON sat_test_registrations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );
