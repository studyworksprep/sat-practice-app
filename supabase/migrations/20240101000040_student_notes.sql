-- Student-private rich-text notes.
--
-- Distinct from question_notes (tutor-authored, org-scoped) and
-- question_error_notes (per-user, per-question, plain text). This
-- table powers the new-tree /notes surface: a student keeps free-form
-- notes that may or may not be tied to a specific question, with rich
-- text + math content stored as a TipTap JSON document. Owner-only —
-- tutors never see student notes through this table.
--
-- body_json is the source of truth (TipTap doc). body_text is a
-- plain-text projection the Server Action computes on every save so
-- the index page can show snippets and full-text search can hit a
-- single column without parsing JSON.

create table if not exists public.student_notes (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  -- Optional link back to a question; nullable so students can keep
  -- standalone notes too. ON DELETE SET NULL because the note's
  -- content survives even if the question is later removed.
  question_id uuid        references public.questions_v2(id) on delete set null,
  title       text,
  body_json   jsonb       not null default '{}'::jsonb,
  body_text   text        not null default '',
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists student_notes_user_updated_idx
  on public.student_notes (user_id, updated_at desc);

create index if not exists student_notes_user_question_idx
  on public.student_notes (user_id, question_id);

create index if not exists student_notes_tags_gin_idx
  on public.student_notes using gin (tags);

create index if not exists student_notes_body_text_search_idx
  on public.student_notes using gin (to_tsvector('english', body_text));

alter table public.student_notes enable row level security;

drop policy if exists student_notes_select on public.student_notes;
create policy student_notes_select on public.student_notes
  for select using (user_id = auth.uid());

drop policy if exists student_notes_insert on public.student_notes;
create policy student_notes_insert on public.student_notes
  for insert with check (user_id = auth.uid());

drop policy if exists student_notes_update on public.student_notes;
create policy student_notes_update on public.student_notes
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists student_notes_delete on public.student_notes;
create policy student_notes_delete on public.student_notes
  for delete using (user_id = auth.uid());

-- Keep updated_at fresh on every UPDATE so the index page's
-- "most recent first" ordering stays accurate.
create or replace function public.touch_student_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists student_notes_touch_updated on public.student_notes;
create trigger student_notes_touch_updated
  before update on public.student_notes
  for each row execute function public.touch_student_notes_updated_at();
