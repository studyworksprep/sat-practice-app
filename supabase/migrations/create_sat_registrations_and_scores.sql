-- SAT test registrations (multiple per student)
CREATE TABLE IF NOT EXISTS public.sat_test_registrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.sat_test_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own registrations"
  ON public.sat_test_registrations FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view assigned student registrations"
  ON public.sat_test_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_student_assignments tsa
      WHERE tsa.teacher_id = auth.uid() AND tsa.student_id = sat_test_registrations.student_id
    )
  );

CREATE POLICY "Teachers can insert registrations for assigned students"
  ON public.sat_test_registrations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "Teachers can delete registrations for assigned students"
  ON public.sat_test_registrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- Official SAT test scores
CREATE TABLE IF NOT EXISTS public.sat_official_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_date date NOT NULL,
  rw_score integer NOT NULL,
  math_score integer NOT NULL,
  composite_score integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.sat_official_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own scores"
  ON public.sat_official_scores FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view assigned student scores"
  ON public.sat_official_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_student_assignments tsa
      WHERE tsa.teacher_id = auth.uid() AND tsa.student_id = sat_official_scores.student_id
    )
  );

CREATE POLICY "Teachers can insert scores for assigned students"
  ON public.sat_official_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "Teachers can delete scores"
  ON public.sat_official_scores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );
