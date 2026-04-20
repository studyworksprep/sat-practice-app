-- =========================================================
-- Direct teacher-student assignments
-- Simpler than class-based enrollments for admin-managed assignments
-- =========================================================

create table if not exists public.teacher_student_assignments (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (teacher_id, student_id)
);

create index if not exists tsa_teacher_idx on public.teacher_student_assignments(teacher_id);
create index if not exists tsa_student_idx on public.teacher_student_assignments(student_id);

alter table public.teacher_student_assignments enable row level security;

-- Admins can do everything; teachers can view their own assignments
drop policy if exists tsa_select on public.teacher_student_assignments;
create policy tsa_select on public.teacher_student_assignments
  for select using (
    public.is_admin()
    or teacher_id = auth.uid()
    or student_id = auth.uid()
  );

drop policy if exists tsa_insert on public.teacher_student_assignments;
create policy tsa_insert on public.teacher_student_assignments
  for insert with check (public.is_admin());

drop policy if exists tsa_delete on public.teacher_student_assignments;
create policy tsa_delete on public.teacher_student_assignments
  for delete using (public.is_admin());

-- Update teacher_can_view_student to also check direct assignments
create or replace function public.teacher_can_view_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or exists (
           select 1 from public.class_enrollments ce
           join public.classes c on c.id = ce.class_id
           where ce.student_id = target_student_id
             and c.teacher_id = auth.uid()
         )
      or exists (
           select 1 from public.teacher_student_assignments tsa
           where tsa.student_id = target_student_id
             and tsa.teacher_id = auth.uid()
         );
$$;

-- Note: the practice_test_attempts policies that originally lived
-- in this file have been split out to
-- 20240101000010_add_practice_test_attempts_base_policies.sql,
-- because this file now sorts EARLIER than the migration that
-- creates the practice_test_attempts table. See
-- docs/architecture-plan.md Phase 1 §2.1 on schema drift.
