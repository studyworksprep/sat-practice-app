-- =========================================================
-- Learning Content System
-- Lessons with ordered blocks (rich text, video, knowledge
-- checks, question bank links), topic tagging, assignments,
-- and student progress tracking.
-- =========================================================

-- 1) LESSONS — the top-level content container
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  visibility  text not null default 'shared'
    check (visibility in ('shared', 'private')),
  status      text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists lessons_author_idx on public.lessons(author_id);
create index if not exists lessons_status_idx on public.lessons(status);

-- 2) LESSON BLOCKS — ordered content blocks within a lesson
create table if not exists public.lesson_blocks (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  sort_order  integer not null default 0,
  block_type  text not null
    check (block_type in ('text', 'video', 'check', 'question_link')),
  content     jsonb not null default '{}',
  created_at  timestamptz default now()
);

create index if not exists lesson_blocks_lesson_idx on public.lesson_blocks(lesson_id);

-- Block content JSONB shapes:
--   text:          { "html": "<p>...</p>" }
--   video:         { "url": "https://...", "caption": "..." }
--   check:         { "prompt": "...", "choices": ["A","B","C","D"],
--                    "correct_index": 2, "explanation": "..." }
--   question_link: { "question_id": "abc-123" }

-- 3) LESSON TOPICS — many-to-many tagging by SAT domain/skill
create table if not exists public.lesson_topics (
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  domain_name text not null,
  skill_code  text,  -- null = domain-level tag only
  primary key (lesson_id, domain_name, coalesce(skill_code, ''))
);

create index if not exists lesson_topics_domain_idx on public.lesson_topics(domain_name);

-- 4) LESSON ASSIGNMENTS — teacher assigns lessons to students
create table if not exists public.lesson_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  due_date    timestamptz,
  created_at  timestamptz default now()
);

create index if not exists lesson_assignments_teacher_idx on public.lesson_assignments(teacher_id);
create index if not exists lesson_assignments_lesson_idx on public.lesson_assignments(lesson_id);

-- 5) LESSON ASSIGNMENT STUDENTS — junction table
create table if not exists public.lesson_assignment_students (
  assignment_id uuid not null references public.lesson_assignments(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz default now(),
  primary key (assignment_id, student_id)
);

create index if not exists las_student_idx on public.lesson_assignment_students(student_id);
create index if not exists las_assignment_idx on public.lesson_assignment_students(assignment_id);

-- 6) LESSON PROGRESS — tracks student progress through a lesson
create table if not exists public.lesson_progress (
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  completed_blocks text[] not null default '{}',  -- block IDs the student has completed
  check_answers   jsonb not null default '{}',    -- { blockId: { selected: 1, correct: true } }
  started_at      timestamptz default now(),
  completed_at    timestamptz,                    -- null until all blocks done
  primary key (lesson_id, student_id)
);

create index if not exists lp_student_idx on public.lesson_progress(student_id);

-- =========================================================
-- RLS
-- =========================================================

alter table public.lessons enable row level security;
alter table public.lesson_blocks enable row level security;
alter table public.lesson_topics enable row level security;
alter table public.lesson_assignments enable row level security;
alter table public.lesson_assignment_students enable row level security;
alter table public.lesson_progress enable row level security;

-- Helper: check if a student is assigned to a lesson assignment
create or replace function public.is_lesson_assignment_student(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_assignment_students
    where assignment_id = p_assignment_id and student_id = p_student_id
  );
$$;

-- Helper: check if user is the teacher who owns a lesson assignment
create or replace function public.is_lesson_assignment_teacher(p_assignment_id uuid, p_teacher_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_assignments
    where id = p_assignment_id and teacher_id = p_teacher_id
  );
$$;

-- Helper: check if a student has been assigned a specific lesson (by any teacher)
create or replace function public.student_has_lesson_assignment(p_lesson_id uuid, p_student_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_assignments la
    join public.lesson_assignment_students las on las.assignment_id = la.id
    where la.lesson_id = p_lesson_id and las.student_id = p_student_id
  );
$$;

-- ---- LESSONS policies ----

-- Everyone can browse published+shared lessons; authors see their own; admins see all
create policy lessons_select on public.lessons
  for select using (
    (visibility = 'shared' and status = 'published')
    or author_id = auth.uid()
    or public.is_admin()
    or public.student_has_lesson_assignment(id, auth.uid())
  );

create policy lessons_insert on public.lessons
  for insert with check (
    public.is_teacher() and author_id = auth.uid()
  );

create policy lessons_update on public.lessons
  for update
  using  (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy lessons_delete on public.lessons
  for delete using (author_id = auth.uid() or public.is_admin());

-- ---- LESSON BLOCKS policies ----
-- Blocks follow their parent lesson's visibility

create or replace function public.can_view_lesson(p_lesson_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lessons
    where id = p_lesson_id
      and (
        (visibility = 'shared' and status = 'published')
        or author_id = auth.uid()
        or public.is_admin()
        or public.student_has_lesson_assignment(id, auth.uid())
      )
  );
$$;

create or replace function public.is_lesson_author(p_lesson_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lessons
    where id = p_lesson_id and author_id = auth.uid()
  );
$$;

create policy lesson_blocks_select on public.lesson_blocks
  for select using (public.can_view_lesson(lesson_id));

create policy lesson_blocks_insert on public.lesson_blocks
  for insert with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_blocks_update on public.lesson_blocks
  for update
  using  (public.is_lesson_author(lesson_id) or public.is_admin())
  with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_blocks_delete on public.lesson_blocks
  for delete using (public.is_lesson_author(lesson_id) or public.is_admin());

-- ---- LESSON TOPICS policies ----

create policy lesson_topics_select on public.lesson_topics
  for select using (public.can_view_lesson(lesson_id));

create policy lesson_topics_insert on public.lesson_topics
  for insert with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_topics_update on public.lesson_topics
  for update
  using  (public.is_lesson_author(lesson_id) or public.is_admin())
  with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_topics_delete on public.lesson_topics
  for delete using (public.is_lesson_author(lesson_id) or public.is_admin());

-- ---- LESSON ASSIGNMENTS policies ----

create policy lesson_assignments_select on public.lesson_assignments
  for select using (
    teacher_id = auth.uid()
    or public.is_admin()
    or public.is_lesson_assignment_student(id, auth.uid())
  );

create policy lesson_assignments_insert on public.lesson_assignments
  for insert with check (
    public.is_teacher() and teacher_id = auth.uid()
  );

create policy lesson_assignments_update on public.lesson_assignments
  for update
  using  (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

create policy lesson_assignments_delete on public.lesson_assignments
  for delete using (teacher_id = auth.uid() or public.is_admin());

-- ---- LESSON ASSIGNMENT STUDENTS policies ----

create policy las_select on public.lesson_assignment_students
  for select using (
    student_id = auth.uid()
    or public.is_lesson_assignment_teacher(assignment_id, auth.uid())
    or public.is_admin()
  );

create policy las_insert on public.lesson_assignment_students
  for insert with check (
    public.is_lesson_assignment_teacher(assignment_id, auth.uid())
    or public.is_admin()
  );

create policy las_delete on public.lesson_assignment_students
  for delete using (
    public.is_lesson_assignment_teacher(assignment_id, auth.uid())
    or public.is_admin()
  );

-- ---- LESSON PROGRESS policies ----

create policy lesson_progress_select on public.lesson_progress
  for select using (
    student_id = auth.uid()
    or public.teacher_can_view_student(student_id)
  );

create policy lesson_progress_insert on public.lesson_progress
  for insert with check (student_id = auth.uid());

create policy lesson_progress_update on public.lesson_progress
  for update
  using  (student_id = auth.uid())
  with check (student_id = auth.uid());
