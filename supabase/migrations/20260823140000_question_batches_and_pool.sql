-- Question batches + opt-in question pool
-- (prep for importing externally sourced question sets — e.g. the
-- "March 2026 SAT" reconstruction batch)
--
-- Two requirements drive this schema:
--
--   1. Provenance. Imported questions arrive in labeled batches;
--      each batch records which SAT administration its material was
--      gathered from (administration_date), so skill/pattern mix
--      can be compared across administrations over time.
--   2. Opt-in visibility. Imported questions must not reach a
--      student through any filter-driven selection surface
--      (practice launcher, diagnostic, study-plan drills, review
--      queue, tutor assignment generator, quick-find) unless
--      explicitly requested. questions_v2.pool is the flag those
--      surfaces exclude on; it is denormalized onto the question
--      row because every selector queries questions_v2 directly.
--
-- pool semantics:
--   'standard' — the default bank; behavior unchanged everywhere.
--   'opt_in'   — served only when a student picks the batch in the
--                practice launcher's "Extra practice sets" section,
--                or through explicit by-id selection (quick-find
--                click-through, lesson packs, admin surfaces).

-- ── 1. question_batches ─────────────────────────────────────────────

create table if not exists public.question_batches (
  id                  uuid primary key default gen_random_uuid(),
  source              text not null,
  label               text not null,
  administration_date date,
  notes               text,
  pool                text not null default 'opt_in'
                        check (pool in ('standard', 'opt_in')),
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (source, label)
);

comment on table public.question_batches is
  'One row per question-import batch (e.g. "March 2026 US SAT"). Carries provenance for trend analysis; questions_v2.batch_id points here.';
comment on column public.question_batches.administration_date is
  'The SAT administration the batch material was gathered from. Grouping key for pattern/skill trend queries.';
comment on column public.question_batches.pool is
  'Default pool stamped onto this batch''s questions at import. Promoting a batch to the standard bank means updating this AND its questions'' pool.';

alter table public.question_batches enable row level security;

-- Reference data: labels/dates only. Readable by every signed-in
-- user (the practice launcher lists opt-in batches); admin-authored.
-- Same policy shape as question_patterns.
create policy question_batches_select on public.question_batches
  for select using (true);
create policy question_batches_admin_insert on public.question_batches
  for insert with check (is_admin());
create policy question_batches_admin_update on public.question_batches
  for update using (is_admin()) with check (is_admin());
create policy question_batches_admin_delete on public.question_batches
  for delete using (is_admin());

-- ── 2. questions_v2.batch_id + pool ─────────────────────────────────

alter table public.questions_v2
  add column if not exists batch_id uuid references public.question_batches (id),
  add column if not exists pool text not null default 'standard';

alter table public.questions_v2
  add constraint questions_v2_pool_check check (pool in ('standard', 'opt_in'));

comment on column public.questions_v2.batch_id is
  'Import batch this question arrived in (question_batches.id). NULL for the pre-existing bank. No ON DELETE action: a batch that still has questions cannot be deleted.';
comment on column public.questions_v2.pool is
  'Visibility pool. ''standard'' = default bank. ''opt_in'' = excluded from every filter-driven selector unless the session explicitly opted into the question''s batch.';

create index if not exists questions_v2_batch_id_idx
  on public.questions_v2 (batch_id)
  where batch_id is not null;

-- ── 3. Import idempotency ───────────────────────────────────────────
--
-- Nothing previously stopped a re-run of a bulk importer from
-- duplicating every row (verified 2026-08-23: zero conflicting
-- pairs in prod before this index). Importers key rows by
-- (source, source_external_id); make that an actual invariant.

create unique index if not exists questions_v2_source_external_id_uniq
  on public.questions_v2 (source, source_external_id)
  where source_external_id is not null;

-- ── 4. published_question_taxonomy: standard pool only ──────────────
--
-- The rollup feeds the practice launcher's skill picker and the New
-- Assignment form. Both select questions through filter pipelines
-- that now exclude the opt-in pool, so the counts must exclude it
-- too. Definition otherwise identical to the live view (verified
-- against pg_get_viewdef on prod 2026-08-23 — matched the
-- 20260517000001 file).

create or replace view public.published_question_taxonomy
  with (security_invoker = on)
  as
select
  domain_name,
  skill_name,
  count(*)::int                                                          as question_count,
  array_agg(distinct score_band) filter (where score_band is not null)   as score_bands,
  array_agg(distinct difficulty) filter (where difficulty is not null)   as difficulties,
  max(domain_code)                                                       as domain_code
from public.questions_v2
where is_published = true
  and is_broken    = false
  and deleted_at  is null
  and pool         = 'standard'
  and domain_name is not null
  and skill_name  is not null
group by domain_name, skill_name;

-- ── 5. published_question_batches — launcher list ───────────────────
--
-- The "Extra practice sets" section lists every opt-in batch that
-- has at least one live question, with a count. security_invoker:
-- students hit the questions_v2 published-read policy and the
-- question_batches select policy above.

create or replace view public.published_question_batches
  with (security_invoker = on)
  as
select
  b.id,
  b.label,
  b.administration_date,
  count(*)::int as question_count
from public.question_batches b
join public.questions_v2 q on q.batch_id = b.id
where b.pool = 'opt_in'
  and q.is_published = true
  and q.is_broken    = false
  and q.deleted_at  is null
group by b.id, b.label, b.administration_date;

grant select on public.published_question_batches to authenticated;
