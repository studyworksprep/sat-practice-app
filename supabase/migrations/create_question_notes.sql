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
