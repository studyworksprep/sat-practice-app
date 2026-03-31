-- Concept tags: a global list of reusable tags
create table if not exists public.concept_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Junction table: many-to-many between questions and concept_tags
create table if not exists public.question_concept_tags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id uuid not null references public.concept_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(question_id, tag_id)
);

-- Indexes
create index if not exists idx_question_concept_tags_question on public.question_concept_tags(question_id);
create index if not exists idx_question_concept_tags_tag on public.question_concept_tags(tag_id);
create index if not exists idx_concept_tags_name on public.concept_tags(name);

-- RLS
alter table public.concept_tags enable row level security;
alter table public.question_concept_tags enable row level security;

-- concept_tags: managers and admins can read
create policy "concept_tags_select" on public.concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- concept_tags: managers and admins can insert
create policy "concept_tags_insert" on public.concept_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- concept_tags: only admins can update
create policy "concept_tags_update" on public.concept_tags
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- concept_tags: only admins can delete
create policy "concept_tags_delete" on public.concept_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- question_concept_tags: managers and admins can read
create policy "question_concept_tags_select" on public.question_concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- question_concept_tags: managers and admins can insert
create policy "question_concept_tags_insert" on public.question_concept_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- question_concept_tags: admins can delete (remove tag from question)
create policy "question_concept_tags_delete" on public.question_concept_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- updated_at trigger for concept_tags
create trigger set_concept_tags_updated_at
  before update on public.concept_tags
  for each row execute function public.set_updated_at();
