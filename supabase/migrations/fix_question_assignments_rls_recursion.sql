-- Fix infinite recursion in RLS policies between question_assignments
-- and question_assignment_students. The original policies had direct
-- cross-table subqueries that triggered each other's RLS evaluation.
-- Replace them with SECURITY DEFINER helper functions that bypass RLS.

-- 1. Drop the old policies that cause recursion
drop policy if exists "Teachers manage own assignments" on public.question_assignments;
drop policy if exists "Students view assigned assignments" on public.question_assignments;
drop policy if exists "View assignment students" on public.question_assignment_students;
drop policy if exists "Teachers manage assignment students" on public.question_assignment_students;

-- 2. Create SECURITY DEFINER helpers to break the circular dependency

-- Check if a student is assigned to an assignment (bypasses RLS)
create or replace function public.is_student_assigned(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_assignment_students
    where assignment_id = p_assignment_id and student_id = p_student_id
  );
$$;

-- Check if a teacher owns an assignment (bypasses RLS)
create or replace function public.is_assignment_teacher(p_assignment_id uuid, p_teacher_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_assignments
    where id = p_assignment_id and teacher_id = p_teacher_id
  );
$$;

-- 3. Recreate policies using the helper functions

-- Teachers manage their own assignments; admins manage all
create policy "Teachers manage own assignments" on public.question_assignments
  for all using (
    teacher_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Students can view assignments they are assigned to
create policy "Students view assigned assignments" on public.question_assignments
  for select using (
    public.is_student_assigned(id, auth.uid())
  );

-- Students see their own rows; teachers/admins see rows for their assignments
create policy "View assignment students" on public.question_assignment_students
  for select using (
    student_id = auth.uid()
    or public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Teachers and admins can insert/update/delete assignment students
create policy "Teachers manage assignment students" on public.question_assignment_students
  for all using (
    public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
