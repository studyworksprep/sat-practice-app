-- Question assignments: teacher creates an assignment with a set of questions for students
create table if not exists public.question_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  filter_criteria jsonb, -- { domains, topics, difficulties, score_bands } used to generate question set
  question_ids text[] not null default '{}', -- array of question UUIDs as text
  created_at timestamptz default now()
);

create index if not exists qa_teacher_idx on public.question_assignments(teacher_id);

-- Which students are assigned to each assignment
create table if not exists public.question_assignment_students (
  assignment_id uuid not null references public.question_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (assignment_id, student_id)
);

create index if not exists qas_student_idx on public.question_assignment_students(student_id);
create index if not exists qas_assignment_idx on public.question_assignment_students(assignment_id);

-- RLS
alter table public.question_assignments enable row level security;
alter table public.question_assignment_students enable row level security;

-- Teachers can manage their own assignments; admins can manage all
create policy "Teachers manage own assignments" on public.question_assignments
  for all using (
    teacher_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Helpers to break RLS circular dependency between question_assignments
-- and question_assignment_students (each policy references the other table).
-- SECURITY DEFINER functions run as the owner and bypass RLS.

-- Used by question_assignments policy to check student membership
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

-- Used by question_assignment_students policies to check teacher ownership
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

-- Students can view assignments they are assigned to
create policy "Students view assigned assignments" on public.question_assignments
  for select using (
    public.is_student_assigned(id, auth.uid())
  );

-- Students can view assignments they're assigned to; teachers/admins see theirs
create policy "View assignment students" on public.question_assignment_students
  for select using (
    student_id = auth.uid()
    or public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Teachers and admins can insert/delete assignment students
create policy "Teachers manage assignment students" on public.question_assignment_students
  for all using (
    public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
