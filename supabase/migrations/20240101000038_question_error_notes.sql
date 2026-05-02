-- Per-user error-log notes on v2 questions.
--
-- Legacy "Error Log" lives on question_status.notes — a single text
-- column on the v1-keyed question_status table. The v2 review tree
-- doesn't read or write that, and the v1 keying means it can't
-- survive v1 decommissioning.
--
-- This table is the v2-native replacement: one note per
-- (user, questions_v2(id)) pair. Owner-only RLS — error log
-- entries are a private student-facing surface; tutors don't see
-- them. (If we later want tutor visibility we'd add a separate
-- can_view branch; better to gate it explicitly than to rely on a
-- broad SELECT policy.)

create table if not exists public.question_error_notes (
  user_id      uuid        not null references auth.users(id) on delete cascade,
  question_id  uuid        not null references public.questions_v2(id) on delete cascade,
  body         text        not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index if not exists question_error_notes_user_updated_idx
  on public.question_error_notes (user_id, updated_at desc);

alter table public.question_error_notes enable row level security;

drop policy if exists question_error_notes_select on public.question_error_notes;
create policy question_error_notes_select on public.question_error_notes
  for select using (user_id = auth.uid());

drop policy if exists question_error_notes_insert on public.question_error_notes;
create policy question_error_notes_insert on public.question_error_notes
  for insert with check (user_id = auth.uid());

drop policy if exists question_error_notes_update on public.question_error_notes;
create policy question_error_notes_update on public.question_error_notes
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists question_error_notes_delete on public.question_error_notes;
create policy question_error_notes_delete on public.question_error_notes
  for delete using (user_id = auth.uid());

-- Bump updated_at on every UPDATE so the listMyErrorNotes ordering
-- stays accurate.
create or replace function public.touch_question_error_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists question_error_notes_touch_updated on public.question_error_notes;
create trigger question_error_notes_touch_updated
  before update on public.question_error_notes
  for each row execute function public.touch_question_error_notes_updated_at();
