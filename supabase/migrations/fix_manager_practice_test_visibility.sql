-- Fix: Managers cannot view practice test results for their assigned teachers.
-- The pta_select policy on practice_test_attempts only allows the owner or
-- teacher_can_view_student(), which doesn't cover the manager→teacher chain.
-- Similarly, the attempts table has the same gap.
-- This adds manager visibility for both their teachers' own attempts AND
-- their teachers' students' attempts.

-- 1) practice_test_attempts: managers can view attempts by their assigned teachers
--    or by students of their assigned teachers
DROP POLICY IF EXISTS pta_select ON public.practice_test_attempts;
CREATE POLICY pta_select ON public.practice_test_attempts
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.teacher_can_view_student(user_id)
    -- Manager can see their assigned teachers' own attempts
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = practice_test_attempts.user_id
    )
    -- Manager can see attempts by students of their assigned teachers
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      JOIN public.teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = practice_test_attempts.user_id
    )
  );

-- 2) attempts: managers can view question attempts by their assigned teachers
--    or by students of their assigned teachers
DROP POLICY IF EXISTS attempts_select ON public.attempts;
CREATE POLICY attempts_select ON public.attempts
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.teacher_can_view_student(user_id)
    -- Manager can see their assigned teachers' own attempts
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = attempts.user_id
    )
    -- Manager can see attempts by students of their assigned teachers
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      JOIN public.teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = attempts.user_id
    )
  );
