-- =========================================================
-- question_content_history — snapshot-on-edit (§1.9)
-- =========================================================
-- v2 dropped question versioning, so editing a published question
-- silently rewrites history under existing attempts — and the AI-drafts
-- pipeline makes edits routine. Owner decision (2026-07-13):
-- SNAPSHOT-ON-EDIT. When a published question's CONTENT changes, capture
-- the PRIOR content here first, so what a student saw is recoverable and
-- reports can flag "edited since attempted".
--
-- Scope note (inherent to snapshot-on-edit vs full versioning): attempts
-- carry no version key, so an attempt ties to a snapshot only by
-- timestamp (an attempt before a snapshot saw content at least as old as
-- that snapshot). Good enough for the "edited since attempted" report;
-- exact per-attempt version reconstruction would need full versioning
-- (the heavier option the owner declined). No backfill — history begins
-- accumulating from the first edit after this migration.

create table if not exists public.question_content_history (
  id               uuid primary key default gen_random_uuid(),
  question_id      uuid not null references public.questions_v2(id) on delete cascade,
  -- the content as it was BEFORE the edit that triggered this snapshot
  question_type    text,
  stem_html        text,
  stimulus_html    text,
  rationale_html   text,
  options          jsonb,
  correct_answer   jsonb,
  domain_code      text,
  skill_code       text,
  difficulty       integer,
  score_band       integer,
  -- provenance
  snapshotted_at   timestamptz not null default now(),
  edited_by        uuid,          -- updated_by of the NEW (post-edit) version
  prior_updated_at timestamptz    -- updated_at of the prior version
);

comment on table public.question_content_history is
  'Prior-content snapshots captured when a published question is edited '
  '(§1.9 snapshot-on-edit). Written by the snapshot_question_content '
  'trigger; attempts tie to snapshots by timestamp (no version key).';

create index if not exists question_content_history_q_idx
  on public.question_content_history (question_id, snapshotted_at desc);

-- Staff-facing (contains question content, not student PII). Writes come
-- only from the SECURITY DEFINER trigger; admins may clean up.
alter table public.question_content_history enable row level security;
drop policy if exists qch_staff_select on public.question_content_history;
drop policy if exists qch_admin_write  on public.question_content_history;
create policy qch_staff_select on public.question_content_history
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role in ('teacher', 'manager'))
  );
create policy qch_admin_write on public.question_content_history
  for all to public using (public.is_admin()) with check (public.is_admin());

-- ── The snapshot trigger ───────────────────────────────────────────
-- Fires only when a PUBLISHED question's CONTENT actually changes.
-- Deliberately ignores non-content churn (attempt_count/correct_count
-- denorm, rendered_* refresh, approval/flag columns, updated_at) — those
-- must not create history rows. This is why updated_at alone is too
-- noisy a signal (it bumps on every UPDATE) and content is compared
-- column-by-column here.
create or replace function public.snapshot_question_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if OLD.is_published is true and (
       OLD.stem_html      is distinct from NEW.stem_html
    or OLD.stimulus_html  is distinct from NEW.stimulus_html
    or OLD.rationale_html is distinct from NEW.rationale_html
    or OLD.options        is distinct from NEW.options
    or OLD.correct_answer is distinct from NEW.correct_answer
    or OLD.domain_code    is distinct from NEW.domain_code
    or OLD.skill_code     is distinct from NEW.skill_code
    or OLD.difficulty     is distinct from NEW.difficulty
    or OLD.score_band     is distinct from NEW.score_band
  ) then
    insert into public.question_content_history (
      question_id, question_type, stem_html, stimulus_html, rationale_html,
      options, correct_answer, domain_code, skill_code, difficulty, score_band,
      edited_by, prior_updated_at
    ) values (
      OLD.id, OLD.question_type, OLD.stem_html, OLD.stimulus_html, OLD.rationale_html,
      OLD.options, OLD.correct_answer, OLD.domain_code, OLD.skill_code, OLD.difficulty, OLD.score_band,
      NEW.updated_by, OLD.updated_at
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_snapshot_question_content on public.questions_v2;
create trigger trg_snapshot_question_content
  before update on public.questions_v2
  for each row execute function public.snapshot_question_content();

-- ── Report helper: was this question edited after a given time? ────
-- SECURITY DEFINER so it works for any caller (returns only a boolean,
-- no content leak) — reports use it to flag "edited since attempted".
create or replace function public.question_edited_since(p_question uuid, p_since timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.question_content_history h
    where h.question_id = p_question and h.snapshotted_at > p_since);
$$;

grant execute on function public.question_edited_since(uuid, timestamptz) to authenticated;
