-- Allow students to view the profile of their assigned teacher.
-- Without this, students cannot resolve their teacher's name or email
-- because the profiles_select RLS policy only allows teacher→student visibility.

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
    -- Student can see their assigned teacher
    OR EXISTS (
      SELECT 1 FROM teacher_student_assignments tsa
      WHERE tsa.student_id = auth.uid() AND tsa.teacher_id = profiles.id
    )
  );
