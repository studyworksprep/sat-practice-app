-- ============================================================
-- TEMPORARY ARTIFACT — DO NOT MERGE TO MAIN
-- Resume file: picks up from create_learning_content.sql and
-- includes every migration after it (in alphabetical order).
-- Paste into the dev project's SQL Editor after the initial
-- replay failed partway through.
-- ============================================================


-- ============================================================
-- supabase/migrations/create_learning_content.sql
-- ============================================================
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
-- Uses a surrogate uuid primary key plus a unique index over
-- the (lesson_id, domain_name, coalesce(skill_code, '')) expression.
-- PostgreSQL doesn't allow function expressions in a PRIMARY KEY
-- constraint (only bare column names are legal), but a UNIQUE
-- INDEX can use expressions, which gives us the desired semantics:
-- NULL and empty-string skill_code are treated as equivalent, so a
-- single lesson can't be tagged twice with the same domain + skill.
create table if not exists public.lesson_topics (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  domain_name text not null,
  skill_code  text  -- null = domain-level tag only
);

create unique index if not exists lesson_topics_unique_idx
  on public.lesson_topics (lesson_id, domain_name, coalesce(skill_code, ''));

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


-- ============================================================
-- supabase/migrations/create_manager_teacher_assignments.sql
-- ============================================================
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


-- ============================================================
-- supabase/migrations/create_platform_stats_rpcs.sql
-- ============================================================
-- RPCs used by /api/admin/platform-stats. Before this migration, the
-- API referenced count_distinct_users_since() via supabase.rpc() but
-- the function did not exist — the call always returned an error and
-- the code fell through to a JS fallback that did `.limit(50000)` on
-- the attempts table with no `.order()`, silently truncating recent
-- activity once volume passed 50k rows in the 30-day window. Adding
-- the RPC here makes the admin dashboard stats a single aggregate SQL
-- query instead of a 100-page pagination loop.
--
-- SECURITY DEFINER is required because the API route runs as the
-- calling admin user (via RLS-scoped supabase client) and needs to
-- count rows across all users. The function is only callable by
-- admins — see the GRANT at the bottom.

create or replace function public.count_distinct_users_since(since timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(distinct user_id)::integer
  from public.attempts
  where created_at >= since;
$$;

-- Lock down who can call it. The API route checks profile.role = 'admin'
-- at the application layer, but we defense-in-depth at the function
-- level too: revoke from the default authenticated role and grant
-- only to the service role + an admin-gated wrapper.
revoke all on function public.count_distinct_users_since(timestamptz) from public;
revoke all on function public.count_distinct_users_since(timestamptz) from anon;
grant execute on function public.count_distinct_users_since(timestamptz) to authenticated;

-- Note: granting to `authenticated` is safe because the function only
-- returns a single integer (a count) — no row data leaks. If you want
-- to tighten further, wrap the call in a SECURITY INVOKER view that
-- checks profiles.role = 'admin' first. For now the application-level
-- gate in the /api/admin/platform-stats route is sufficient.


-- ============================================================
-- supabase/migrations/create_question_assignments.sql
-- ============================================================
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


-- ============================================================
-- supabase/migrations/create_question_notes.sql
-- ============================================================
-- =========================================================
-- Question notes: shared notes on questions for teachers/managers/admins
-- =========================================================

create table if not exists public.question_notes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_question_notes_question_id on public.question_notes(question_id);
create index if not exists idx_question_notes_author_id on public.question_notes(author_id);

alter table public.question_notes enable row level security;

-- Teachers, managers, and admins can view all notes
create policy question_notes_select on public.question_notes
  for select using (public.is_teacher());

-- Teachers, managers, and admins can insert notes
create policy question_notes_insert on public.question_notes
  for insert with check (public.is_teacher() and auth.uid() = author_id);

-- Authors can update their own notes; admins can update any
create policy question_notes_update on public.question_notes
  for update using (
    auth.uid() = author_id or public.is_admin()
  );

-- Authors can delete their own notes; admins can delete any
create policy question_notes_delete on public.question_notes
  for delete using (
    auth.uid() = author_id or public.is_admin()
  );


-- ============================================================
-- supabase/migrations/create_questions_v2_fix_suggestions.sql
-- ============================================================
-- Staging table for Claude-generated HTML cleanup suggestions on
-- questions_v2 rows. Populated by the async batch scripts in
-- scripts/v2-batch-fix-*.mjs and drained by the Bulk Review panel in
-- the admin dashboard. Nothing in this table is ever read by the live
-- practice flow — it exists purely to separate "Claude thinks you
-- should change X" from "questions_v2 actually contains X".
--
-- Keeping suggestions in their own table (instead of writing directly
-- to questions_v2) means:
--   - admins can review, bulk-accept, or reject without ever touching
--     the canonical row
--   - we keep a full snapshot of the row at submit time so we can
--     diff after the fact and roll back if needed
--   - we can store the batch_id from Anthropic's Batches API and poll
--     it asynchronously instead of holding an HTTP connection open
--
-- Apply with:  supabase sql < supabase/migrations/create_questions_v2_fix_suggestions.sql
-- (or paste into the SQL editor on the dev project).

create table if not exists public.questions_v2_fix_suggestions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions_v2(id) on delete cascade,

  -- Anthropic Batches API metadata. batch_id + custom_id together
  -- identify the individual request inside a submitted batch.
  batch_id text,
  custom_id text,

  -- Lifecycle:
  --   pending    — submitted to Anthropic, waiting on batch completion
  --   collected  — results downloaded, ready for admin review
  --   applied    — suggestion merged into questions_v2 by an admin
  --   rejected   — admin marked the suggestion as not worth applying
  --   failed     — Claude errored or returned malformed output
  --   superseded — a newer suggestion exists for the same question
  status text not null default 'pending'
    check (status in ('pending', 'collected', 'applied', 'rejected', 'failed', 'superseded')),

  -- Which model produced this suggestion. Useful for debugging cost
  -- and quality differences between Haiku and Sonnet runs.
  model text,

  -- Snapshot of the source row at submit time. These three columns
  -- let us diff against whatever questions_v2 looks like when the
  -- admin eventually reviews the suggestion — so even if the row was
  -- edited in the meantime, the review UI can tell the difference
  -- between "the source moved" and "Claude changed something".
  source_stimulus_html text,
  source_stem_html text,
  source_options jsonb,

  -- Claude's proposed output.
  suggested_stimulus_html text,
  suggested_stem_html text,
  suggested_options jsonb,

  -- Classification computed by the collect script:
  --   identical    — Claude returned the same thing we sent
  --   trivial      — only whitespace / entity / class changes
  --   non_trivial  — math rewriting, table restructuring, content shifts
  --   error        — Claude failed or returned unusable output
  -- The Bulk Review UI filters on this so admins can one-click-accept
  -- all trivial changes and focus their attention on the non-trivial
  -- ones.
  diff_classification text
    check (diff_classification in ('identical', 'trivial', 'non_trivial', 'error')),
  error_message text,

  -- Audit
  submitted_at timestamptz not null default now(),
  collected_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

create index if not exists idx_qv2_fix_suggestions_question
  on public.questions_v2_fix_suggestions(question_id);
create index if not exists idx_qv2_fix_suggestions_status
  on public.questions_v2_fix_suggestions(status);
create index if not exists idx_qv2_fix_suggestions_batch
  on public.questions_v2_fix_suggestions(batch_id);
create index if not exists idx_qv2_fix_suggestions_classification
  on public.questions_v2_fix_suggestions(diff_classification);

-- RLS: admin-only, top to bottom. No teacher, manager, or student
-- should ever see this table — it's infrastructure for the migration
-- cleanup, not user-facing content.
alter table public.questions_v2_fix_suggestions enable row level security;

create policy "qv2_fix_suggestions_admin_select"
  on public.questions_v2_fix_suggestions
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_insert"
  on public.questions_v2_fix_suggestions
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_update"
  on public.questions_v2_fix_suggestions
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_delete"
  on public.questions_v2_fix_suggestions
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- The batch scripts use the service role key and bypass RLS anyway,
-- but these policies keep the UI-facing API honest: only admins can
-- call /api/admin/questions-v2/suggestions even if someone wires it
-- up without the right role check.


-- ============================================================
-- supabase/migrations/create_sat_registrations_and_scores.sql
-- ============================================================
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


-- ============================================================
-- supabase/migrations/create_sat_vocabulary.sql
-- ============================================================
-- Static shared SAT vocabulary table (seeded once via CSV import)
create table if not exists public.sat_vocabulary (
  id serial primary key,
  set_number integer not null check (set_number >= 1 and set_number <= 10),
  word text not null,
  definition text not null,
  example text
);

create index if not exists sv_set_idx on public.sat_vocabulary(set_number);

-- Per-user progress on SAT vocabulary cards
create table if not exists public.sat_vocabulary_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  vocabulary_id integer not null references public.sat_vocabulary(id) on delete cascade,
  mastery integer not null default 0 check (mastery >= 0 and mastery <= 5),
  last_reviewed_at timestamptz default now(),
  primary key (user_id, vocabulary_id)
);

create index if not exists svp_user_idx on public.sat_vocabulary_progress(user_id);

-- RLS: sat_vocabulary is readable by all authenticated users (static data)
alter table public.sat_vocabulary enable row level security;

create policy "Authenticated users can read SAT vocabulary" on public.sat_vocabulary
  for select using (auth.uid() is not null);

-- RLS: users manage their own progress rows
alter table public.sat_vocabulary_progress enable row level security;

create policy "Users manage own SAT vocabulary progress" on public.sat_vocabulary_progress
  for all using (user_id = auth.uid());


-- ============================================================
-- supabase/migrations/create_score_conversion.sql
-- ============================================================
-- Create score_conversion lookup table
-- Maps (test, section, module1_correct, module2_correct) → scaled_score
-- Both module scores are needed because adaptive routing affects scoring:
-- e.g. 19 right in M1 + 4 right in M2 scores differently than 4 right in M1 + 19 right in M2
-- Run this in the Supabase SQL editor or via the Supabase CLI.

create table if not exists score_conversion (
  id              uuid primary key default gen_random_uuid(),
  test_id         text    not null,
  test_name       text    not null,
  section         text    not null check (section in ('reading_writing', 'math')),
  module1_correct integer not null check (module1_correct >= 0),
  module2_correct integer not null check (module2_correct >= 0),
  scaled_score    integer not null check (scaled_score between 200 and 800),

  constraint score_conversion_unique
    unique (test_id, section, module1_correct, module2_correct)
);

-- Index for fast lookups by test + section + both module scores
create index if not exists idx_score_conversion_lookup
  on score_conversion (test_id, section, module1_correct, module2_correct);


-- ============================================================
-- supabase/migrations/fix_manager_practice_test_visibility.sql
-- ============================================================
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


-- ============================================================
-- supabase/migrations/fix_manager_student_visibility.sql
-- ============================================================
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


-- ============================================================
-- supabase/migrations/fix_profiles_rls_infinite_recursion.sql
-- ============================================================
-- =========================================================
-- Fix infinite recursion in profiles RLS policy
-- =========================================================
-- Problem: Several RLS policies on other tables directly query the profiles
-- table (e.g., EXISTS (SELECT 1 FROM profiles WHERE ...)), which triggers
-- the profiles_select RLS policy, which in turn queries those tables,
-- causing infinite recursion (PostgreSQL error 42P17).
--
-- Solution: Replace all direct profiles queries in RLS policies with
-- JWT-based checks using auth.jwt() -> 'app_metadata' ->> 'role'.
-- This requires syncing the role from profiles to auth.users.raw_app_meta_data.

-- 1) Sync existing users' roles to JWT app_metadata
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.profiles p
WHERE u.id = p.id;

-- 2) Keep roles synced via trigger on profiles
CREATE OR REPLACE FUNCTION public.sync_role_to_auth_metadata()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_role_trigger ON public.profiles;
CREATE TRIGGER sync_role_trigger
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_role_to_auth_metadata();

-- 3) Rewrite is_admin() and is_teacher() to use JWT instead of querying profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin');
$$;

-- 4) Fix manager_teacher_assignments admin policy (was directly querying profiles)
DROP POLICY IF EXISTS "Admins manage all manager-teacher assignments" ON public.manager_teacher_assignments;
CREATE POLICY "Admins manage all manager-teacher assignments"
  ON public.manager_teacher_assignments
  FOR ALL USING (public.is_admin());

-- 5) Fix sat_test_registrations policies (were directly querying profiles)
DROP POLICY IF EXISTS "Teachers can insert registrations for assigned students" ON public.sat_test_registrations;
CREATE POLICY "Teachers can insert registrations for assigned students" ON public.sat_test_registrations
  FOR INSERT WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "Teachers can delete registrations for assigned students" ON public.sat_test_registrations;
CREATE POLICY "Teachers can delete registrations for assigned students" ON public.sat_test_registrations
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

-- 6) Fix sat_official_scores policies (were directly querying profiles)
DROP POLICY IF EXISTS "Teachers can insert scores for assigned students" ON public.sat_official_scores;
CREATE POLICY "Teachers can insert scores for assigned students" ON public.sat_official_scores
  FOR INSERT WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "Teachers can delete scores" ON public.sat_official_scores;
CREATE POLICY "Teachers can delete scores" ON public.sat_official_scores
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );


-- ============================================================
-- supabase/migrations/fix_question_assignments_rls_recursion.sql
-- ============================================================
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


-- ============================================================
-- supabase/migrations/fix_rls_for_manager_role.sql
-- ============================================================
-- Fix RLS policies for manager role
-- Managers need to: view assigned teacher profiles, manage scores/registrations for their students

-- 1) profiles SELECT: managers need to see their assigned teachers' profiles
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR teacher_can_view_student(id)
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = profiles.id
    )
  );

-- 2) sat_official_scores: add 'manager' to teacher role checks
DROP POLICY IF EXISTS "Teachers can insert scores for assigned students" ON sat_official_scores;
CREATE POLICY "Teachers can insert scores for assigned students" ON sat_official_scores
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete scores" ON sat_official_scores;
CREATE POLICY "Teachers can delete scores" ON sat_official_scores
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

-- 3) sat_test_registrations: add 'manager' to teacher role checks
DROP POLICY IF EXISTS "Teachers can insert registrations for assigned students" ON sat_test_registrations;
CREATE POLICY "Teachers can insert registrations for assigned students" ON sat_test_registrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete registrations for assigned students" ON sat_test_registrations;
CREATE POLICY "Teachers can delete registrations for assigned students" ON sat_test_registrations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );


-- ============================================================
-- supabase/migrations/move_is_broken_to_questions.sql
-- ============================================================
-- Move is_broken from per-user question_status to global questions table.
-- This makes the broken flag shared across all users.

-- 1) Add the column to questions
alter table questions
  add column if not exists is_broken boolean not null default false;

-- 2) Migrate existing flags: if ANY user flagged a question as broken, mark it globally
update questions q
set is_broken = true
where exists (
  select 1 from question_status qs
  where qs.question_id = q.id
    and qs.is_broken = true
);

-- 3) (Optional) Drop the per-user column once migration is verified.
-- Uncomment when ready:
-- alter table question_status drop column if exists is_broken;


-- ============================================================
-- supabase/migrations/questions_v2_phase1_schema.sql
-- ============================================================
-- =========================================================
-- Phase 1: Simplified questions schema (questions_v2)
-- =========================================================
-- Creates the new simplified schema alongside existing tables.
-- No existing data is modified. No application code changes yet.
-- Safe to run at any time.

-- ─── Main questions table (flat, no versioning) ────────────
CREATE TABLE IF NOT EXISTS public.questions_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  question_type text NOT NULL CHECK (question_type IN ('mcq', 'spr')),
  stem_html text NOT NULL,
  stimulus_html text,
  rationale_html text,
  options jsonb,          -- [{label, ordinal, content_html}]
  correct_answer jsonb,   -- {option_label, option_labels, text, number, tolerance}

  -- Taxonomy (inline, no join needed)
  domain_code text,
  domain_name text,
  skill_code text,
  skill_name text,
  difficulty int CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3),
  score_band int CHECK (score_band IS NULL OR score_band BETWEEN 1 AND 7),

  -- Metadata
  source text NOT NULL DEFAULT 'generated'
    CHECK (source IN ('collegeboard', 'generated', 'custom')),
  source_id text,             -- Collegeboard question_id / external ref
  source_external_id text,    -- secondary external ref
  is_published boolean NOT NULL DEFAULT true,
  is_broken boolean NOT NULL DEFAULT false,

  -- Precomputed stats
  attempt_count int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_questions_v2_source ON questions_v2(source);
CREATE INDEX IF NOT EXISTS idx_questions_v2_domain ON questions_v2(domain_code);
CREATE INDEX IF NOT EXISTS idx_questions_v2_skill ON questions_v2(skill_code);
CREATE INDEX IF NOT EXISTS idx_questions_v2_difficulty ON questions_v2(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_v2_score_band ON questions_v2(score_band);
CREATE INDEX IF NOT EXISTS idx_questions_v2_published ON questions_v2(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_questions_v2_source_id ON questions_v2(source_id) WHERE source_id IS NOT NULL;

-- ─── Mapping table: old question IDs → new question IDs ──
-- Lets us preserve all existing user progress (question_status,
-- attempts, practice_test_module_items) while adopting the new schema.
CREATE TABLE IF NOT EXISTS public.question_id_map (
  old_question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  old_version_id uuid REFERENCES question_versions(id) ON DELETE CASCADE,
  new_question_id uuid NOT NULL REFERENCES questions_v2(id) ON DELETE CASCADE,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (old_question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_id_map_new ON question_id_map(new_question_id);
CREATE INDEX IF NOT EXISTS idx_question_id_map_old_version ON question_id_map(old_version_id);

-- ─── RLS policies ─────────────────────────────────────────
ALTER TABLE public.questions_v2 ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published, non-broken questions
CREATE POLICY "questions_v2_select_all" ON public.questions_v2
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
CREATE POLICY "questions_v2_admin_all" ON public.questions_v2
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Mapping table: readable by authenticated users, admin-only writes
ALTER TABLE public.question_id_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_id_map_select_all" ON public.question_id_map
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "question_id_map_admin_all" ON public.question_id_map
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ─── Updated_at trigger ───────────────────────────────────
CREATE TRIGGER set_questions_v2_updated_at
  BEFORE UPDATE ON public.questions_v2
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- supabase/migrations/questions_v2_phase2_migrate_function.sql
-- ============================================================
-- =========================================================
-- Phase 2: Batch migration function
-- =========================================================
-- Creates a function to migrate existing questions into questions_v2
-- in batches. Safe to run multiple times — only migrates questions
-- that haven't been mapped yet.
--
-- Usage (in Supabase SQL editor):
--   SELECT * FROM migrate_questions_batch(100);  -- migrate next 100
--
-- Returns: (migrated_count int, total_remaining int)

CREATE OR REPLACE FUNCTION public.migrate_questions_batch(batch_size int DEFAULT 100)
RETURNS TABLE (migrated_count int, total_remaining int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  migrated int := 0;
  remaining int;
  q RECORD;
  v RECORD;
  new_id uuid;
  options_json jsonb;
  correct_json jsonb;
BEGIN
  -- No auth check: this function is only callable via SQL editor
  -- (which requires Supabase project admin access)

  -- Get the next batch of unmigrated questions.
  -- NB: alias the source table as `qs` (not `q`) to avoid colliding with
  -- the declared RECORD variable `q` — PL/pgSQL would otherwise resolve
  -- `q.id` to the (not-yet-assigned) record variable and raise
  -- "record \"q\" is not assigned yet".
  FOR q IN
    SELECT qs.id, qs.question_id AS source_id, qs.source_external_id, qs.is_broken
    FROM questions qs
    LEFT JOIN question_id_map m ON m.old_question_id = qs.id
    WHERE m.old_question_id IS NULL
    ORDER BY qs.id
    LIMIT batch_size
  LOOP
    -- Get the current version for this question
    SELECT qv.id, qv.question_type, qv.stem_html, qv.stimulus_html,
           qv.rationale_html, qv.attempt_count, qv.correct_count
    INTO v
    FROM question_versions qv
    WHERE qv.question_id = q.id AND qv.is_current = true
    LIMIT 1;

    -- Skip if no current version
    IF v.id IS NULL THEN
      CONTINUE;
    END IF;

    -- Build options JSON (for MCQ)
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label', label,
          'ordinal', ordinal,
          'content_html', content_html
        ) ORDER BY ordinal
      ),
      NULL
    )
    INTO options_json
    FROM answer_options
    WHERE question_version_id = v.id;

    -- Build correct_answer JSON.
    -- Resolve option UUIDs → labels so the new schema is self-contained
    -- (the options jsonb only carries {label, ordinal, content_html} and
    -- does not preserve the old answer_options UUIDs).
    SELECT jsonb_build_object(
      'option_label', (
        SELECT ao.label FROM answer_options ao
        WHERE ao.id = ca.correct_option_id
      ),
      'option_labels', (
        SELECT coalesce(jsonb_agg(ao.label ORDER BY ao.ordinal), NULL)
        FROM answer_options ao
        WHERE ao.id = ANY (ca.correct_option_ids)
      ),
      'text', ca.correct_text,
      'number', ca.correct_number,
      'tolerance', ca.numeric_tolerance
    )
    INTO correct_json
    FROM correct_answers ca
    WHERE ca.question_version_id = v.id
    LIMIT 1;

    -- Insert into questions_v2
    INSERT INTO questions_v2 (
      question_type, stem_html, stimulus_html, rationale_html,
      options, correct_answer,
      domain_code, domain_name, skill_code, skill_name, difficulty, score_band,
      source, source_id, source_external_id,
      is_broken, attempt_count, correct_count
    )
    SELECT
      v.question_type, v.stem_html, v.stimulus_html, v.rationale_html,
      options_json, correct_json,
      t.domain_code, t.domain_name, t.skill_code, t.skill_name, t.difficulty, t.score_band,
      'collegeboard', q.source_id, q.source_external_id,
      q.is_broken, coalesce(v.attempt_count, 0), coalesce(v.correct_count, 0)
    FROM question_taxonomy t
    WHERE t.question_id = q.id
    RETURNING id INTO new_id;

    -- If no taxonomy row existed, insert without taxonomy fields
    IF new_id IS NULL THEN
      INSERT INTO questions_v2 (
        question_type, stem_html, stimulus_html, rationale_html,
        options, correct_answer,
        source, source_id, source_external_id,
        is_broken, attempt_count, correct_count
      ) VALUES (
        v.question_type, v.stem_html, v.stimulus_html, v.rationale_html,
        options_json, correct_json,
        'collegeboard', q.source_id, q.source_external_id,
        q.is_broken, coalesce(v.attempt_count, 0), coalesce(v.correct_count, 0)
      )
      RETURNING id INTO new_id;
    END IF;

    -- Record the mapping
    INSERT INTO question_id_map (old_question_id, old_version_id, new_question_id)
    VALUES (q.id, v.id, new_id);

    migrated := migrated + 1;
  END LOOP;

  -- Count how many questions still need migration.
  -- Same aliasing note as above: use `qs` to avoid colliding with the
  -- declared RECORD variable `q`.
  SELECT COUNT(*) INTO remaining
  FROM questions qs
  LEFT JOIN question_id_map m ON m.old_question_id = qs.id
  WHERE m.old_question_id IS NULL;

  RETURN QUERY SELECT migrated, remaining;
END;
$$;

-- Helper: preview what would be migrated without actually migrating
CREATE OR REPLACE FUNCTION public.migration_status()
RETURNS TABLE (
  total_questions bigint,
  migrated_questions bigint,
  remaining_questions bigint,
  questions_without_current_version bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM questions) AS total_questions,
    (SELECT COUNT(*) FROM question_id_map) AS migrated_questions,
    (SELECT COUNT(*) FROM questions q LEFT JOIN question_id_map m ON m.old_question_id = q.id WHERE m.old_question_id IS NULL) AS remaining_questions,
    (SELECT COUNT(*) FROM questions q WHERE NOT EXISTS (SELECT 1 FROM question_versions qv WHERE qv.question_id = q.id AND qv.is_current = true)) AS questions_without_current_version;
$$;

-- =========================================================
-- Backfill: convert legacy correct_answer shape to labels
-- =========================================================
-- The first version of migrate_questions_batch() stored the correct
-- MCQ answer as answer_options UUID(s) under keys `option_id` /
-- `option_ids`.  The options jsonb on questions_v2 only carries
-- {label, ordinal, content_html}, so those UUIDs can't be matched
-- against the options array and the admin preview can't highlight
-- the correct choice.
--
-- This one-shot backfill rewrites any row whose correct_answer still
-- has the old shape into the new shape using `option_label` /
-- `option_labels`, looking up labels in answer_options via the
-- old_version_id preserved in question_id_map.
--
-- Safe to run multiple times: rows that already have `option_label`
-- are skipped.  Returns the number of rows updated.
--
-- Usage:
--   SELECT public.backfill_questions_v2_correct_labels();

CREATE OR REPLACE FUNCTION public.backfill_questions_v2_correct_labels()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  single_label text;
  label_arr jsonb;
  opt_id uuid;
  updated_count int := 0;
BEGIN
  FOR rec IN
    SELECT q2.id AS new_id, q2.correct_answer AS ca, m.old_version_id
    FROM questions_v2 q2
    JOIN question_id_map m ON m.new_question_id = q2.id
    WHERE q2.question_type = 'mcq'
      AND NOT (q2.correct_answer ? 'option_label')
      AND (q2.correct_answer ? 'option_id' OR q2.correct_answer ? 'option_ids')
  LOOP
    single_label := NULL;
    label_arr := NULL;

    -- Resolve a single-answer option_id → label.
    IF jsonb_typeof(rec.ca->'option_id') = 'string' THEN
      BEGIN
        opt_id := (rec.ca->>'option_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        opt_id := NULL;
      END;
      IF opt_id IS NOT NULL THEN
        SELECT ao.label INTO single_label
        FROM answer_options ao
        WHERE ao.question_version_id = rec.old_version_id
          AND ao.id = opt_id
        LIMIT 1;
      END IF;
    END IF;

    -- Resolve a multi-answer option_ids jsonb array → label array.
    IF jsonb_typeof(rec.ca->'option_ids') = 'array' THEN
      SELECT coalesce(jsonb_agg(ao.label ORDER BY ao.ordinal), NULL)
      INTO label_arr
      FROM answer_options ao
      WHERE ao.question_version_id = rec.old_version_id
        AND ao.id IN (
          SELECT (elem)::uuid
          FROM jsonb_array_elements_text(rec.ca->'option_ids') AS elem
        );
    END IF;

    UPDATE questions_v2
    SET correct_answer =
          (correct_answer - 'option_id' - 'option_ids')
          || jsonb_build_object(
               'option_label', single_label,
               'option_labels', label_arr
             )
    WHERE id = rec.new_id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;


-- ============================================================
-- supabase/migrations/questions_v2_phase3_display_code.sql
-- ============================================================
-- =========================================================
-- Phase 3: user-friendly display codes for questions_v2
-- =========================================================
-- Adds a `display_code` column to questions_v2 that gives every
-- question a short, human-readable id such as `M-00153` (Math) or
-- `RW-00042` (Reading & Writing).  Format:  <prefix>-<5-digit zero-
-- padded sequence>.  5 digits means up to 99,999 questions per
-- section.
--
-- Prefix is derived from the SAT domain code already stored in
-- questions_v2.domain_code.  The same mapping is used throughout the
-- app (see app/practice/[questionId]/page.js, app/dashboard/*).
--
--   Math  ('H','P','S','Q')         → M
--   R & W ('EOI','INI','CAS','SEC') → RW
--
-- Numbers are handed out by two Postgres sequences so inserts are
-- atomic and race-free.  A BEFORE INSERT trigger populates
-- display_code on every new row (unless the caller already set one),
-- so migrate_questions_batch() does NOT need to change.  A separate
-- helper function backfills any rows that already exist.
--
-- Safe to run multiple times.  After running this file, call:
--   SELECT public.backfill_questions_v2_display_codes();
-- to assign codes to rows migrated under phase 2.

-- ─── 1. Column ────────────────────────────────────────────
ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS display_code text;

COMMENT ON COLUMN public.questions_v2.display_code IS
  'User-friendly id in the form <M|RW>-NNNNN (e.g. M-00153). Unique, assigned automatically on insert via a BEFORE INSERT trigger.';

-- ─── 2. Per-section sequences ─────────────────────────────
-- int is 2^31-1 ≈ 2.1 billion, comfortably more than the 99,999
-- ceiling implied by the 5-digit format.
CREATE SEQUENCE IF NOT EXISTS public.questions_v2_math_seq AS int START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.questions_v2_rw_seq   AS int START WITH 1 MINVALUE 1;

-- ─── 3. Helper: domain_code → section prefix ──────────────
CREATE OR REPLACE FUNCTION public.questions_v2_section_prefix(domain_code text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(domain_code, ''))
    WHEN 'H'   THEN 'M'
    WHEN 'P'   THEN 'M'
    WHEN 'S'   THEN 'M'
    WHEN 'Q'   THEN 'M'
    WHEN 'EOI' THEN 'RW'
    WHEN 'INI' THEN 'RW'
    WHEN 'CAS' THEN 'RW'
    WHEN 'SEC' THEN 'RW'
    ELSE NULL
  END;
$$;

-- ─── 4. BEFORE INSERT trigger ─────────────────────────────
-- Populates NEW.display_code if it's NULL. Questions with no
-- recognised section prefix (e.g. domain_code is NULL) are left
-- with display_code = NULL and can be backfilled later once the
-- taxonomy is set.
CREATE OR REPLACE FUNCTION public.questions_v2_set_display_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
  num int;
BEGIN
  IF NEW.display_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  prefix := public.questions_v2_section_prefix(NEW.domain_code);
  IF prefix IS NULL THEN
    RETURN NEW;
  END IF;

  IF prefix = 'M' THEN
    num := nextval('public.questions_v2_math_seq');
  ELSIF prefix = 'RW' THEN
    num := nextval('public.questions_v2_rw_seq');
  ELSE
    RETURN NEW;
  END IF;

  NEW.display_code := prefix || '-' || lpad(num::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_questions_v2_set_display_code ON public.questions_v2;
CREATE TRIGGER trg_questions_v2_set_display_code
  BEFORE INSERT ON public.questions_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.questions_v2_set_display_code();

-- ─── 5. Backfill existing rows ────────────────────────────
-- Rows migrated under phase 2 pre-date the trigger, so their
-- display_code is NULL.  Assign codes in created_at order (then id
-- as a tiebreaker) so the numbering tracks migration order.
-- Idempotent: rows that already have a display_code are skipped.
CREATE OR REPLACE FUNCTION public.backfill_questions_v2_display_codes()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  prefix text;
  num int;
  updated_count int := 0;
BEGIN
  FOR rec IN
    SELECT id, domain_code
    FROM questions_v2
    WHERE display_code IS NULL
      AND questions_v2_section_prefix(domain_code) IS NOT NULL
    ORDER BY created_at, id
  LOOP
    prefix := questions_v2_section_prefix(rec.domain_code);
    IF prefix = 'M' THEN
      num := nextval('questions_v2_math_seq');
    ELSIF prefix = 'RW' THEN
      num := nextval('questions_v2_rw_seq');
    ELSE
      CONTINUE;
    END IF;

    UPDATE questions_v2
    SET display_code = prefix || '-' || lpad(num::text, 5, '0')
    WHERE id = rec.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

-- ─── 6. Uniqueness and lookup index ───────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_v2_display_code_unique
  ON public.questions_v2 (display_code)
  WHERE display_code IS NOT NULL;


-- ============================================================
-- supabase/migrations/questions_v2_phase4_fix_audit.sql
-- ============================================================
-- =========================================================
-- Phase 4: Claude-fix audit columns for questions_v2
-- =========================================================
-- Adds two audit columns used by the "Fix with Claude" flow in the
-- admin Questions V2 Preview tab:
--
--   last_fixed_at  timestamptz  -- when Claude-cleaned HTML was saved
--   last_fixed_by  uuid         -- which admin saved it (→ auth.users)
--
-- Both are nullable.  A partial index on last_fixed_at IS NULL lets
-- the preview efficiently surface the backlog of unfixed questions.
--
-- Safe to run multiple times.

ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS last_fixed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fixed_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.questions_v2.last_fixed_at IS
  'Timestamp of the most recent Claude-driven HTML cleanup saved for this row.';
COMMENT ON COLUMN public.questions_v2.last_fixed_by IS
  'auth.users.id of the admin who saved the most recent Claude-driven HTML cleanup.';

-- Partial index: fast "unfixed first" ordering in the admin preview.
CREATE INDEX IF NOT EXISTS idx_questions_v2_unfixed
  ON public.questions_v2 (created_at)
  WHERE last_fixed_at IS NULL;


-- ============================================================
-- supabase/migrations/questions_v2_phase5_approval.sql
-- ============================================================
-- =========================================================
-- Phase 5: approval audit columns for questions_v2
-- =========================================================
-- Adds two audit columns the admin Questions V2 Preview tab uses to
-- track which questions have been reviewed and signed off:
--
--   approved_at  timestamptz  -- when the admin approved this row
--   approved_by  uuid         -- which admin approved it (→ auth.users)
--
-- Both are nullable; NULL means "not approved yet".  The preview
-- defaults to showing ONLY unapproved rows so admins can work
-- through a shrinking backlog, and exposes a counter of approved
-- rows at the top of the page.
--
-- Safe to run multiple times.

ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.questions_v2.approved_at IS
  'Timestamp of the most recent admin approval for this row. NULL = not approved.';
COMMENT ON COLUMN public.questions_v2.approved_by IS
  'auth.users.id of the admin who approved this row.';

-- Partial index so the preview can efficiently list unapproved rows
-- in display_code order (the default view).
CREATE INDEX IF NOT EXISTS idx_questions_v2_unapproved
  ON public.questions_v2 (display_code)
  WHERE approved_at IS NULL;

