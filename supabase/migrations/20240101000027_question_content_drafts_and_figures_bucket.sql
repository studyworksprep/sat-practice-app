-- Phase 4 — question_content_drafts + question-figures storage bucket.
--
-- Motivation. The question bank inherited from College Board has a
-- known tail of inconsistent entries: 39 rows that were truncated
-- during ingest (the "TRIMMED" marker left in-place where a huge
-- inline base64 image overflowed the import), 560+ rows carrying
-- base64 math-images that should really be MathML, and an unknown
-- number of rows whose figures are missing or wrong. Cleanup has
-- been deferred because we had no non-destructive way to stage a
-- fix and review it before promoting to production. This migration
-- introduces the two pieces of infrastructure that unblock the
-- cleanup:
--
--   1. public.question_content_drafts — staging rows that shadow
--      the four content fields of questions_v2 (stem_html,
--      stimulus_html, rationale_html, options) plus a status /
--      audit envelope. Multiple drafts per question allowed; the
--      latest by created_at is the working draft. Promotion is
--      done by a separate Server Action (not a trigger) so the
--      admin UI can do side-by-side preview and explicit approval.
--
--   2. storage bucket "question-figures" — a content-addressed
--      public bucket for figure assets (restored SVGs, replacement
--      diagrams for TRIMMED rows, and eventually all figures that
--      currently live inline as base64). Filenames are sha256
--      hashes so repeated uploads of the same asset dedup for free;
--      CB reuses the same geometry shapes across questions.
--
-- Scope discipline. No existing rows touched. No RLS on other
-- tables changed. questions_v2 schema unchanged. The admin UI
-- that consumes this lives at app/next/(admin)/admin/content/…
-- and is shipped under the new-tree carve-out — zero legacy
-- impact.

-- ============================================================
-- 1. question_content_drafts table
-- ============================================================

create table if not exists public.question_content_drafts (
  id               uuid         primary key default gen_random_uuid(),
  question_id      uuid         not null references public.questions_v2(id) on delete cascade,

  -- Parallel to questions_v2's content fields. NULL means "no
  -- proposed change to this field" — so a draft that fixes only
  -- the rationale leaves stem_html/stimulus_html/options NULL and
  -- promotion only touches rationale_html.
  stem_html        text,
  stimulus_html    text,
  rationale_html   text,
  options          jsonb,

  notes            text,

  status           text         not null default 'pending'
    check (status in ('pending', 'review', 'approved', 'rejected', 'promoted')),

  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now(),
  created_by       uuid         references auth.users(id),
  reviewed_at      timestamptz,
  reviewed_by      uuid         references auth.users(id),
  promoted_at      timestamptz,
  promoted_by      uuid         references auth.users(id)
);

-- Most lookups are "drafts for this question" or "all open drafts".
create index if not exists idx_qcd_question_id on public.question_content_drafts (question_id);
create index if not exists idx_qcd_open_status on public.question_content_drafts (status)
  where status <> 'promoted';

-- Reuse the shared set_updated_at() trigger. questions_v2 has its
-- own rendered-aware trigger (set_questions_v2_updated_at) but this
-- table doesn't have rendered columns, so the generic trigger is
-- correct — every write is a real edit.
create or replace trigger trg_question_content_drafts_updated_at
  before update on public.question_content_drafts
  for each row execute function public.set_updated_at();

-- RLS: admin-only. Teachers/managers/students get nothing. Opening
-- this up (e.g. teachers drafting fixes for questions they flagged)
-- is a follow-up migration when the workflow warrants it.
alter table public.question_content_drafts enable row level security;

create policy "qcd_admin_all" on public.question_content_drafts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.question_content_drafts to authenticated;

-- ============================================================
-- 2. question-figures storage bucket + RLS
-- ============================================================

-- Public bucket; RLS on storage.objects still restricts writes.
insert into storage.buckets (id, name, public)
values ('question-figures', 'question-figures', true)
on conflict (id) do nothing;

-- Public read. The bucket's public flag alone would grant anon
-- read, but an explicit SELECT policy makes the intent visible
-- alongside the write policies and survives any future change to
-- the bucket flag.
create policy "question_figures_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'question-figures');

-- Writes gated on is_admin(). INSERT, UPDATE, DELETE have separate
-- policies because storage.objects' FOR ALL policy does not accept
-- the "admins may overwrite their own uploads" semantics we'd want
-- if teachers ever get write access later.
create policy "question_figures_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-figures' and public.is_admin());

create policy "question_figures_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'question-figures' and public.is_admin())
  with check (bucket_id = 'question-figures' and public.is_admin());

create policy "question_figures_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-figures' and public.is_admin());

-- Kick PostgREST so /rest/v1/question_content_drafts starts
-- serving immediately rather than on the next scheduled refresh.
notify pgrst, 'reload schema';
