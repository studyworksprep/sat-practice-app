-- =========================================================
-- ACT test imports — staging tables + storage bucket
-- =========================================================
-- See docs/architecture-plan.md §3.4 (cross-test data model).
-- This migration introduces the staging infrastructure for the
-- ACT test-content import pipeline:
--
--   1. public.act_import_jobs — one row per upload event. Tracks
--      the uploaded file URLs, the source_test name, and a
--      per-section parse status the parser updates as it works.
--      Importing a new ACT test means: admin uploads PDFs + the
--      Mathpix-exported math HTML, the parser walks each section
--      and writes drafts, the admin reviews and approves on the
--      sibling drafts table below.
--
--   2. public.act_question_drafts — analog to
--      question_content_drafts on the SAT side. Staging rows
--      that hold parsed question content + suggested taxonomy
--      before approval. Approving promotes content into
--      act_questions + act_answer_options via a Server Action
--      (PR 10c); this migration only sets up storage.
--
--   3. Storage bucket "act-imports" — PRIVATE. Holds source
--      PDFs and HTML. Read access is gated on is_admin() — the
--      bucket holds copyrighted ACT exam content and must not be
--      publicly readable like question-figures is. Writes are
--      admin-only.
--
-- Scope discipline. No existing rows touched, no other tables
-- modified. The pipeline that consumes this lives at
-- app/next/(admin)/admin/act/imports/* and ships behind the
-- admin-role gate.

-- ============================================================
-- 1. act_import_jobs
-- ============================================================

create table if not exists public.act_import_jobs (
  id              uuid primary key default gen_random_uuid(),

  -- The source_test identifier the eventual act_questions rows
  -- will carry. Admin types this on the upload form (e.g.
  -- "ACT-2025-Jun-FormA"). Free-text; the existing 5 forms on
  -- prod have no naming convention to enforce.
  source_test     text not null,

  -- Top-level state. 'uploaded' → admin pressed Save on the
  -- upload form. 'parsing' → at least one section parse is in
  -- flight. 'ready_for_review' → every section finished
  -- (success or skipped), drafts are ready to review.
  -- 'completed' → every draft has been approved or rejected.
  -- 'failed' → unrecoverable parser error; admin can retry by
  -- launching a new job.
  status          text not null default 'uploaded'
    check (status in ('uploaded','parsing','ready_for_review','completed','failed')),

  -- Storage paths. Stored as `act-imports/{job_id}/<filename>`
  -- so the bucket's RLS policy can scope by path prefix in
  -- future without schema changes. NULL when the admin uploads
  -- a subset (e.g. test_pdf only, no Mathpix HTML).
  test_pdf_url    text,
  math_html_url   text,
  answer_key_url  text,
  scale_url       text,

  -- Per-section parser progress. Each section runs as its own
  -- Server Action (PR 10b) and writes its own status here. The
  -- top-level `status` is derived from these but cached so the
  -- listing page can filter without a join.
  english_status  text not null default 'pending'
    check (english_status in ('pending','running','completed','failed','skipped')),
  math_status     text not null default 'pending'
    check (math_status in ('pending','running','completed','failed','skipped')),
  reading_status  text not null default 'pending'
    check (reading_status in ('pending','running','completed','failed','skipped')),
  science_status  text not null default 'pending'
    check (science_status in ('pending','running','completed','failed','skipped')),
  scale_status    text not null default 'pending'
    check (scale_status in ('pending','running','completed','failed','skipped')),

  -- Append-only diagnostic log. Each parse action appends a
  -- structured entry { ts, section, level, message } so the
  -- admin can investigate parser issues without leaving the
  -- job page.
  log_json        jsonb not null default '[]'::jsonb,

  created_by      uuid not null references auth.users(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_act_import_jobs_created_at
  on public.act_import_jobs (created_at desc);
create index if not exists idx_act_import_jobs_source_test
  on public.act_import_jobs (source_test);

create or replace trigger trg_act_import_jobs_updated_at
  before update on public.act_import_jobs
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. act_question_drafts
-- ============================================================

create table if not exists public.act_question_drafts (
  id               uuid primary key default gen_random_uuid(),

  -- The job that produced this draft. Cascade delete so wiping
  -- a botched job removes its drafts cleanly.
  import_job_id    uuid not null references public.act_import_jobs(id) on delete cascade,

  -- Identity. (source_test, source_ordinal, section) uniquely
  -- identifies an ACT question; the drafts table enforces the
  -- same uniqueness scoped to the import job so two parse
  -- attempts on the same job can't produce duplicate drafts.
  source_test      text not null,
  section          text not null check (section in ('english','math','reading','science')),
  source_ordinal   int not null,

  -- Parsed content. Admin can edit any of these before
  -- approving. stimulus_html is the shared passage / table /
  -- chart that may apply to a run of consecutive questions
  -- (English / Reading / Science); stem_html is the question
  -- text itself. rationale_html stays empty in v1 — real ACT
  -- tests don't ship official rationales, and we deferred
  -- Claude-generated explanations.
  stimulus_html    text,
  stem_html        text not null,
  rationale_html   text,

  -- Difficulty. Math = ceil(ordinal * 5 / 60). Science =
  -- progressive within passage + rising crest across passages
  -- (PR 10b computes this from passage boundaries). English /
  -- Reading default null until a student-data-driven pass
  -- assigns difficulty by performance.
  difficulty       int check (difficulty between 1 and 5),

  -- Taxonomy. category is the human-readable name from the
  -- ACT category set (e.g. "Production of Writing"); category_code
  -- is a short stable identifier used in URLs/filters.
  -- Subcategory is more granular and may be null on some
  -- sections.
  category         text,
  category_code    text,
  subcategory      text,
  subcategory_code text,

  -- Options held inline as jsonb since the count varies (4 for
  -- most ACT sections, 5 for math). Shape:
  --   [{ label: 'A', content_html: '...', is_correct: false }, ...]
  -- Promoting a draft inserts these into act_answer_options.
  options_json     jsonb not null default '[]'::jsonb,

  -- Parser hints surfaced to the review UI. needs_figure means
  -- the parser detected a diagram region in the source PDF that
  -- the admin must upload manually. parse_warnings is a list
  -- of short strings for non-fatal issues
  -- ("answer key letter not found", "options count != 4", etc.).
  needs_figure     boolean not null default false,
  parse_warnings   jsonb not null default '[]'::jsonb,

  -- Review state.
  status           text not null default 'ready_for_review'
    check (status in ('parsing','ready_for_review','approved','rejected')),

  -- Set on approval. References the act_questions.id this
  -- draft was promoted into so re-promoting is idempotent and
  -- the audit trail survives.
  approved_to_id   uuid references public.act_questions(id) on delete set null,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (import_job_id, section, source_ordinal)
);

create index if not exists idx_act_question_drafts_job_section
  on public.act_question_drafts (import_job_id, section, source_ordinal);
create index if not exists idx_act_question_drafts_open_status
  on public.act_question_drafts (status)
  where status in ('parsing','ready_for_review');

create or replace trigger trg_act_question_drafts_updated_at
  before update on public.act_question_drafts
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. RLS — admin-only on both tables
-- ============================================================

alter table public.act_import_jobs enable row level security;
alter table public.act_question_drafts enable row level security;

create policy act_import_jobs_admin_all on public.act_import_jobs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy act_question_drafts_admin_all on public.act_question_drafts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.act_import_jobs to authenticated;
grant select, insert, update, delete on public.act_question_drafts to authenticated;

-- ============================================================
-- 4. act-imports storage bucket — PRIVATE
-- ============================================================
--
-- This bucket holds copyrighted ACT source PDFs and the
-- Mathpix-exported math HTML. Unlike question-figures (public
-- read so question rendering works), this bucket must not be
-- publicly accessible. Public flag = false; explicit SELECT
-- policy gates read on is_admin() so even authenticated
-- non-admins can't browse the uploads.

insert into storage.buckets (id, name, public)
values ('act-imports', 'act-imports', false)
on conflict (id) do nothing;

create policy act_imports_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'act-imports' and public.is_admin());

create policy act_imports_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'act-imports' and public.is_admin());

create policy act_imports_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'act-imports' and public.is_admin())
  with check (bucket_id = 'act-imports' and public.is_admin());

create policy act_imports_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'act-imports' and public.is_admin());

-- Refresh PostgREST so the new tables / policies serve
-- immediately.
notify pgrst, 'reload schema';
