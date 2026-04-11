-- Staging table for Claude-generated HTML cleanup suggestions on
-- questions_v2 rows. Populated by the async batch scripts in
-- scripts/v2-batch-fix-*.mjs and drained by the Bulk Review panel in
-- the admin dashboard. Nothing in this table is ever read by the live
-- practice flow — it exists purely to separate "Claude thinks you
-- should change X" from "questions_v2 actually contains X".
--
-- Keeping suggestions in their own table (instead of writing directly
-- to questions_v2) means:
--   - admins can review, bulk-accept, or reject without ever touching
--     the canonical row
--   - we keep a full snapshot of the row at submit time so we can
--     diff after the fact and roll back if needed
--   - we can store the batch_id from Anthropic's Batches API and poll
--     it asynchronously instead of holding an HTTP connection open
--
-- Apply with:  supabase sql < supabase/migrations/create_questions_v2_fix_suggestions.sql
-- (or paste into the SQL editor on the dev project).

create table if not exists public.questions_v2_fix_suggestions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions_v2(id) on delete cascade,

  -- Anthropic Batches API metadata. batch_id + custom_id together
  -- identify the individual request inside a submitted batch.
  batch_id text,
  custom_id text,

  -- Lifecycle:
  --   pending    — submitted to Anthropic, waiting on batch completion
  --   collected  — results downloaded, ready for admin review
  --   applied    — suggestion merged into questions_v2 by an admin
  --   rejected   — admin marked the suggestion as not worth applying
  --   failed     — Claude errored or returned malformed output
  --   superseded — a newer suggestion exists for the same question
  status text not null default 'pending'
    check (status in ('pending', 'collected', 'applied', 'rejected', 'failed', 'superseded')),

  -- Which model produced this suggestion. Useful for debugging cost
  -- and quality differences between Haiku and Sonnet runs.
  model text,

  -- Snapshot of the source row at submit time. These three columns
  -- let us diff against whatever questions_v2 looks like when the
  -- admin eventually reviews the suggestion — so even if the row was
  -- edited in the meantime, the review UI can tell the difference
  -- between "the source moved" and "Claude changed something".
  source_stimulus_html text,
  source_stem_html text,
  source_options jsonb,

  -- Claude's proposed output.
  suggested_stimulus_html text,
  suggested_stem_html text,
  suggested_options jsonb,

  -- Classification computed by the collect script:
  --   identical    — Claude returned the same thing we sent
  --   trivial      — only whitespace / entity / class changes
  --   non_trivial  — math rewriting, table restructuring, content shifts
  --   error        — Claude failed or returned unusable output
  -- The Bulk Review UI filters on this so admins can one-click-accept
  -- all trivial changes and focus their attention on the non-trivial
  -- ones.
  diff_classification text
    check (diff_classification in ('identical', 'trivial', 'non_trivial', 'error')),
  error_message text,

  -- Audit
  submitted_at timestamptz not null default now(),
  collected_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

create index if not exists idx_qv2_fix_suggestions_question
  on public.questions_v2_fix_suggestions(question_id);
create index if not exists idx_qv2_fix_suggestions_status
  on public.questions_v2_fix_suggestions(status);
create index if not exists idx_qv2_fix_suggestions_batch
  on public.questions_v2_fix_suggestions(batch_id);
create index if not exists idx_qv2_fix_suggestions_classification
  on public.questions_v2_fix_suggestions(diff_classification);

-- RLS: admin-only, top to bottom. No teacher, manager, or student
-- should ever see this table — it's infrastructure for the migration
-- cleanup, not user-facing content.
alter table public.questions_v2_fix_suggestions enable row level security;

create policy "qv2_fix_suggestions_admin_select"
  on public.questions_v2_fix_suggestions
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_insert"
  on public.questions_v2_fix_suggestions
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_update"
  on public.questions_v2_fix_suggestions
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_delete"
  on public.questions_v2_fix_suggestions
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- The batch scripts use the service role key and bypass RLS anyway,
-- but these policies keep the UI-facing API honest: only admins can
-- call /api/admin/questions-v2/suggestions even if someone wires it
-- up without the right role check.
