-- ACT Questions: single flat table with content + taxonomy (no versioning)
create table if not exists act_questions (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  section text not null check (section in ('english', 'math', 'reading', 'science')),
  category text not null,
  subcategory text,
  is_modeling boolean not null default false,
  difficulty integer,
  question_type text not null default 'mcq',
  stimulus_html text,
  stem_html text not null,
  rationale_html text,
  source_test text,
  source_ordinal integer,
  is_broken boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_act_questions_section on act_questions (section);
create index idx_act_questions_category on act_questions (section, category);
create index idx_act_questions_source on act_questions (source_test);

-- Answer options keyed directly to question (no version indirection)
create table if not exists act_answer_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references act_questions (id) on delete cascade,
  ordinal integer not null,
  label text not null,
  content_html text not null,
  is_correct boolean not null default false
);

create index idx_act_answer_options_question on act_answer_options (question_id);

-- Immutable attempt log
create table if not exists act_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references act_questions (id) on delete cascade,
  selected_option_id uuid references act_answer_options (id),
  is_correct boolean not null,
  time_spent_ms integer,
  source text not null default 'practice',
  created_at timestamptz not null default now()
);

create index idx_act_attempts_user on act_attempts (user_id);
create index idx_act_attempts_user_question on act_attempts (user_id, question_id);
create index idx_act_attempts_created on act_attempts (user_id, created_at desc);

-- RLS
alter table act_questions enable row level security;
alter table act_answer_options enable row level security;
alter table act_attempts enable row level security;

-- All authenticated users can read questions and options
create policy "act_questions_read" on act_questions
  for select to authenticated using (true);

create policy "act_answer_options_read" on act_answer_options
  for select to authenticated using (true);

-- Users can read their own attempts
create policy "act_attempts_select_own" on act_attempts
  for select to authenticated
  using (user_id = auth.uid());

-- Users can insert their own attempts
create policy "act_attempts_insert_own" on act_attempts
  for insert to authenticated
  with check (user_id = auth.uid());

-- Teachers can view attempts of their assigned students
create policy "act_attempts_teacher_read" on act_attempts
  for select to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = act_attempts.user_id
        and p.teacher_id = auth.uid()
    )
  );
