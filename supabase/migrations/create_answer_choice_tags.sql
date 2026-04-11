-- Answer-choice tags: a tagging system specifically for WRONG answer choices.
-- Mirrors the concept_tags system but scopes tags to individual options on a
-- question (e.g. "Opposite answer", "Eye-catcher", "Sign error"). Tags are
-- visible to teachers/managers/admins only and addable by managers/admins only.
--
-- Keyed by (question_id, option_label) so it survives the planned
-- questions → questions_v2 migration (where options become JSONB rows without
-- stable per-option UUIDs). option_label is the 'A'/'B'/'C'/'D' letter.

-- ─── Tag vocabulary ────────────────────────────────────────────────────
create table if not exists public.answer_choice_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ─── Junction: which options carry which tags ─────────────────────────
create table if not exists public.option_answer_choice_tags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_label text not null,
  tag_id uuid not null references public.answer_choice_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(question_id, option_label, tag_id)
);

create index if not exists idx_answer_choice_tags_name
  on public.answer_choice_tags(name);
create index if not exists idx_option_answer_choice_tags_question
  on public.option_answer_choice_tags(question_id);
create index if not exists idx_option_answer_choice_tags_tag
  on public.option_answer_choice_tags(tag_id);

-- ─── RLS ───────────────────────────────────────────────────────────────
alter table public.answer_choice_tags enable row level security;
alter table public.option_answer_choice_tags enable row level security;

-- Tag vocabulary: teachers, managers, admins can read
create policy "answer_choice_tags_select" on public.answer_choice_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );

-- Tag vocabulary: managers and admins can create
create policy "answer_choice_tags_insert" on public.answer_choice_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- Tag vocabulary: only admins can rename
create policy "answer_choice_tags_update" on public.answer_choice_tags
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Tag vocabulary: only admins can delete
create policy "answer_choice_tags_delete" on public.answer_choice_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Assignments: teachers/managers/admins can read
create policy "option_answer_choice_tags_select" on public.option_answer_choice_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );

-- Assignments: managers and admins can add
create policy "option_answer_choice_tags_insert" on public.option_answer_choice_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- Assignments: only admins can remove
create policy "option_answer_choice_tags_delete" on public.option_answer_choice_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- updated_at trigger for the vocabulary table
create trigger set_answer_choice_tags_updated_at
  before update on public.answer_choice_tags
  for each row execute function public.set_updated_at();

-- ─── Seed a starter list of common SAT wrong-answer traps ──────────────
-- Admins and managers can grow this list from the UI later.
insert into public.answer_choice_tags (name) values
  ('Opposite answer'),
  ('Extreme language'),
  ('Out of scope'),
  ('Half right, half wrong'),
  ('Eye-catcher'),
  ('True but irrelevant'),
  ('Misread stem'),
  ('Common misconception'),
  ('Sign error'),
  ('Wrong operation')
on conflict (name) do nothing;
