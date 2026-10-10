-- =========================================================
-- act_rationale_drafts: model-written rationales awaiting review
-- =========================================================
-- ACT parity Phase 2b. Every ACT question in production has a null
-- rationale_html — students get no explanation after answering.
-- Rationales are generated in batches by the admin surface at
-- /admin/act/rationales and land here first; an admin approves a
-- draft (sampled per section) or bulk-approves the clean ones, and
-- only then does the text reach act_questions.rationale_html.
--
--   question_id     one live draft per question (unique). A
--                   regenerate replaces the row in place.
--   answer_letter   the option label the model identified as
--                   correct — the validator compares it with the
--                   key; a mismatch is stored as an error and the
--                   draft is held for review.
--   needs_review    true for figure questions (the model saw the
--                   image by URL) and for any draft the validator
--                   warned about; bulk approve skips these.
--   warnings        validator notes (jsonb array of strings).
--   model /         which model + prompt revision produced the text,
--   prompt_version  so a later pass can re-run only stale drafts.

create table if not exists public.act_rationale_drafts (
  id             uuid primary key default gen_random_uuid(),
  question_id    uuid not null references public.act_questions (id) on delete cascade,
  rationale_html text not null,
  answer_letter  text,
  confidence     text check (confidence in ('high', 'medium', 'low')),
  model_notes    text,
  model          text not null,
  prompt_version text not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  needs_review   boolean not null default false,
  warnings       jsonb not null default '[]'::jsonb,
  generated_by   uuid references auth.users (id) on delete set null,
  reviewed_by    uuid references auth.users (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (question_id)
);

create index if not exists idx_act_rationale_drafts_status
  on public.act_rationale_drafts (status, needs_review);

alter table public.act_rationale_drafts enable row level security;

drop policy if exists act_rationale_drafts_admin on public.act_rationale_drafts;
create policy act_rationale_drafts_admin on public.act_rationale_drafts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.act_rationale_drafts is
  'Model-written ACT rationales pending admin review. Approval copies rationale_html onto act_questions.';
