-- Manager-teacher assignments: managers oversee specific groups of teachers
-- Mirrors the teacher_student_assignments pattern

CREATE TABLE IF NOT EXISTS public.manager_teacher_assignments (
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT manager_teacher_assignments_pkey PRIMARY KEY (manager_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS mta_manager_idx ON public.manager_teacher_assignments(manager_id);
CREATE INDEX IF NOT EXISTS mta_teacher_idx ON public.manager_teacher_assignments(teacher_id);

-- RLS
ALTER TABLE public.manager_teacher_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "Admins manage all manager-teacher assignments"
  ON public.manager_teacher_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Managers can view their own assignments
CREATE POLICY "Managers can view own assignments"
  ON public.manager_teacher_assignments
  FOR SELECT USING (manager_id = auth.uid());
