-- Flashcard sets: each student has their own sets
create table if not exists public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists fs_user_idx on public.flashcard_sets(user_id);

-- Flashcards: belong to a set
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  front text not null,
  back text not null,
  mastery integer not null default 0 check (mastery >= 0 and mastery <= 5),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create index if not exists fc_set_idx on public.flashcards(set_id);

-- RLS
alter table public.flashcard_sets enable row level security;
alter table public.flashcards enable row level security;

-- Users manage their own sets
create policy "Users manage own flashcard sets" on public.flashcard_sets
  for all using (user_id = auth.uid());

-- Users manage cards in their own sets
create policy "Users manage own flashcards" on public.flashcards
  for all using (
    exists (select 1 from public.flashcard_sets where id = flashcards.set_id and user_id = auth.uid())
  );
