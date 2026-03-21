-- =========================================================
-- Saved Desmos calculator states for questions
-- Managers/admins can save reference calculator states that
-- teachers can load as guidance material
-- =========================================================

create table if not exists public.desmos_saved_states (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  state_json jsonb not null,
  saved_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id)
);

create index if not exists idx_desmos_saved_states_question_id on public.desmos_saved_states(question_id);

alter table public.desmos_saved_states enable row level security;

-- Teachers, managers, and admins can view saved states
create policy desmos_saved_states_select on public.desmos_saved_states
  for select using (public.is_teacher());

-- Only managers and admins can insert
create policy desmos_saved_states_insert on public.desmos_saved_states
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );

-- Only managers and admins can update
create policy desmos_saved_states_update on public.desmos_saved_states
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );

-- Only managers and admins can delete
create policy desmos_saved_states_delete on public.desmos_saved_states
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );
