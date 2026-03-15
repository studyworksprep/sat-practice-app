-- Add parent_set_id to support sub-sets (e.g., "Common SAT Words" → 10 vocab sub-sets)
alter table public.flashcard_sets
  add column if not exists parent_set_id uuid references public.flashcard_sets(id) on delete cascade;

create index if not exists fs_parent_idx on public.flashcard_sets(parent_set_id);
