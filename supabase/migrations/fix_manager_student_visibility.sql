-- Fix: Managers cannot see student profiles, scores, or registrations
-- The profiles_select policy only allowed managers to see their assigned teachers,
-- but not the students of those teachers. The scores/registrations SELECT policies
-- only checked teacher_student_assignments directly, which managers aren't in.
-- This adds the manager→teacher→student chain to all three tables.

-- 1) profiles: managers can see students of their assigned teachers
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR teacher_can_view_student(id)
    OR is_admin()
    -- Manager can see their assigned teachers
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = profiles.id
    )
    -- Manager can see students of their assigned teachers
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      JOIN teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = profiles.id
    )
  );

-- 2) sat_test_registrations: managers can view registrations for their teachers' students
DROP POLICY IF EXISTS "Managers can view assigned student registrations" ON sat_test_registrations;
CREATE POLICY "Managers can view assigned student registrations" ON sat_test_registrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      JOIN teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = sat_test_registrations.student_id
    )
  );

-- 3) sat_official_scores: managers can view scores for their teachers' students
DROP POLICY IF EXISTS "Managers can view assigned student scores" ON sat_official_scores;
CREATE POLICY "Managers can view assigned student scores" ON sat_official_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      JOIN teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = sat_official_scores.student_id
    )
  );
