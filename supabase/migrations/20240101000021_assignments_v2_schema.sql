-- Phase 3 — assignment-model unification.
--
-- A single type-discriminated assignments table replaces the split
-- question_assignments / lesson_assignments tables. The student
-- "Assignments" panel queries one source, branches on
-- assignment_type, and renders the appropriate UI per type.
--
-- Types from day one: 'questions', 'lesson', 'practice_test'.
--   - 'questions':      question_ids + filter_criteria
--   - 'lesson':         lesson_id (FK -> lessons)
--   - 'practice_test':  practice_test_id (FK -> practice_tests_v2)
--
-- The legacy v1 tables (question_assignments, lesson_assignments,
-- and their *_students junctions) stay in service for the legacy
-- app tree until the new tree fully takes over. They drop in Phase 6.
--
-- Notable departures from v1:
--   - question_ids is uuid[] (matches questions_v2.id), not text[].
--   - completed_at lives per-student on assignment_students_v2, not
--     on the parent. Whole-assignment "done" is derived. archived_at
--     on the parent gives teachers a way to hide stale assignments
--     without touching student-side completion semantics.
--   - assignment_students_v2 uses can_view() / is_admin() / is_teacher()
--     directly. No more inline `select role from profiles` checks.
--   - SECURITY DEFINER bridge helpers (is_v2_assignment_student,
--     is_v2_assignment_teacher) avoid the same RLS circular
--     reference v1 hit (see fix_question_assignments_rls_recursion).

-- ============================================================
-- 1. assignments_v2 (parent)
-- ============================================================
create table if not exists public.assignments_v2 (
  id                uuid primary key default gen_random_uuid(),
  teacher_id        uuid not null references public.profiles(id) on delete cascade,
  assignment_type   text not null check (assignment_type in (
                       'questions', 'lesson', 'practice_test'
                     )),

  title             text,
  description       text,
  due_date          timestamptz,
  archived_at       timestamptz,

  -- Type-specific payload columns. Only the column matching the
  -- assignment_type is required (partial CHECK below); the others
  -- are allowed to be set but not enforced.
  question_ids      uuid[],
  filter_criteria   jsonb,
  lesson_id         uuid references public.lessons(id) on delete cascade,
  practice_test_id  uuid references public.practice_tests_v2(id) on delete cascade,

  -- Audit (matches the v2 standard set in migration 000019).
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  deleted_at        timestamptz,

  -- Partial CHECK: each type must have its matching column non-null.
  -- We deliberately do NOT forbid the other type-specific columns
  -- being set; that would make migrations and editor UIs needlessly
  -- brittle. App code is the source of truth for which fields it reads.
  constraint assignments_v2_type_payload_present check (
    (assignment_type = 'questions'      and question_ids is not null)
    or (assignment_type = 'lesson'         and lesson_id is not null)
    or (assignment_type = 'practice_test'  and practice_test_id is not null)
  )
);

create index if not exists idx_av2_teacher
  on public.assignments_v2 (teacher_id);
create index if not exists idx_av2_type
  on public.assignments_v2 (assignment_type);
create index if not exists idx_av2_lesson
  on public.assignments_v2 (lesson_id) where lesson_id is not null;
create index if not exists idx_av2_practice_test
  on public.assignments_v2 (practice_test_id) where practice_test_id is not null;

create or replace trigger trg_assignments_v2_updated_at
  before update on public.assignments_v2
  for each row execute function set_updated_at();

-- ============================================================
-- 2. assignment_students_v2 (junction + per-student completion)
-- ============================================================
create table if not exists public.assignment_students_v2 (
  assignment_id   uuid not null references public.assignments_v2(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

create index if not exists idx_asv2_student
  on public.assignment_students_v2 (student_id);
create index if not exists idx_asv2_assignment
  on public.assignment_students_v2 (assignment_id);

-- ============================================================
-- 3. SECURITY DEFINER bridges to break the parent<->child
--    RLS circular dependency.
--    (Pattern mirrors v1's is_student_assigned / is_assignment_teacher.)
-- ============================================================
create or replace function public.is_v2_assignment_student(
  p_assignment_id uuid,
  p_student_id    uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignment_students_v2
    where assignment_id = p_assignment_id
      and student_id    = p_student_id
  );
$$;

create or replace function public.is_v2_assignment_teacher(
  p_assignment_id uuid,
  p_teacher_id    uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments_v2
    where id         = p_assignment_id
      and teacher_id = p_teacher_id
  );
$$;

revoke all on function public.is_v2_assignment_student(uuid, uuid) from public;
revoke all on function public.is_v2_assignment_student(uuid, uuid) from anon;
grant execute on function public.is_v2_assignment_student(uuid, uuid) to authenticated;

revoke all on function public.is_v2_assignment_teacher(uuid, uuid) from public;
revoke all on function public.is_v2_assignment_teacher(uuid, uuid) from anon;
grant execute on function public.is_v2_assignment_teacher(uuid, uuid) to authenticated;

-- ============================================================
-- 4. RLS — assignments_v2
-- ============================================================
alter table public.assignments_v2 enable row level security;
grant select, insert, update, delete on public.assignments_v2 to authenticated;

drop policy if exists "av2_select"        on public.assignments_v2;
drop policy if exists "av2_insert_teacher" on public.assignments_v2;
drop policy if exists "av2_update_teacher" on public.assignments_v2;
drop policy if exists "av2_delete_admin"  on public.assignments_v2;

-- SELECT: visible to anyone who can see the teacher (self/admin/
-- supervisory hierarchy via can_view), or to a student who is
-- assigned to it.
create policy "av2_select" on public.assignments_v2
  for select to public using (
    can_view(teacher_id)
    or public.is_v2_assignment_student(id, auth.uid())
  );

-- INSERT: teacher creating their own assignment, or admin acting
-- on behalf of one.
create policy "av2_insert_teacher" on public.assignments_v2
  for insert to public with check (
    (is_teacher() and teacher_id = auth.uid())
    or is_admin()
  );

-- UPDATE: same — teacher editing their own, or admin.
create policy "av2_update_teacher" on public.assignments_v2
  for update to public
  using (
    (is_teacher() and teacher_id = auth.uid())
    or is_admin()
  )
  with check (
    (is_teacher() and teacher_id = auth.uid())
    or is_admin()
  );

-- DELETE: admin only. Teachers archive (set archived_at) instead.
create policy "av2_delete_admin" on public.assignments_v2
  for delete to public using (is_admin());

-- ============================================================
-- 5. RLS — assignment_students_v2
-- ============================================================
alter table public.assignment_students_v2 enable row level security;
grant select, insert, update, delete on public.assignment_students_v2 to authenticated;

drop policy if exists "asv2_select"        on public.assignment_students_v2;
drop policy if exists "asv2_insert_teacher" on public.assignment_students_v2;
drop policy if exists "asv2_update_self_or_teacher" on public.assignment_students_v2;
drop policy if exists "asv2_delete_teacher" on public.assignment_students_v2;

-- SELECT: the student themselves, or anyone who can see the
-- assignment's teacher (admin/teacher self/supervisory chain).
create policy "asv2_select" on public.assignment_students_v2
  for select to public using (
    student_id = auth.uid()
    or exists (
      select 1 from public.assignments_v2 a
      where a.id = assignment_id
        and can_view(a.teacher_id)
    )
  );

-- INSERT: teacher of the parent assignment, or admin.
create policy "asv2_insert_teacher" on public.assignment_students_v2
  for insert to public with check (
    public.is_v2_assignment_teacher(assignment_id, auth.uid())
    or is_admin()
  );

-- UPDATE: the student updating their own row (to set completed_at),
-- the parent's teacher, or admin.
create policy "asv2_update_self_or_teacher" on public.assignment_students_v2
  for update to public
  using (
    student_id = auth.uid()
    or public.is_v2_assignment_teacher(assignment_id, auth.uid())
    or is_admin()
  )
  with check (
    student_id = auth.uid()
    or public.is_v2_assignment_teacher(assignment_id, auth.uid())
    or is_admin()
  );

-- DELETE: parent's teacher (un-assigning a student), or admin.
create policy "asv2_delete_teacher" on public.assignment_students_v2
  for delete to public using (
    public.is_v2_assignment_teacher(assignment_id, auth.uid())
    or is_admin()
  );
