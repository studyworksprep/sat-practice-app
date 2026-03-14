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
