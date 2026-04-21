-- Phase 4 — make questions_v2's updated_at semantically meaningful
-- again by ignoring rendered-only writes.
--
-- Background. The generic set_updated_at() trigger installed in
-- migration 000019 bumps updated_at on every write to a v2 content
-- table. For practice_tests_v2 / modules / items that's correct —
-- every write to those tables is a meaningful edit. For
-- questions_v2 it stopped being correct when migration 000025
-- introduced the *_rendered columns: those get written by an
-- offline backfill (scripts/render-math.mjs), which is a
-- derived-data refresh, not a content edit. Without this change,
-- the first backfill run touches updated_at on all ~3,400 rows,
-- and every subsequent re-render touches whatever subset changed —
-- which would pollute any downstream consumer that treats
-- questions_v2.updated_at as a "last human edit" signal.
--
-- Solution. Replace questions_v2's trigger with a column-aware
-- variant: bump updated_at only when a column other than the
-- rendered-set (stem_rendered, stimulus_rendered, rationale_rendered,
-- options_rendered, rendered_source_hash, rendered_at) has actually
-- changed. Uses to_jsonb - <key> to compare "everything except the
-- rendered columns and updated_at itself" in one expression, which
-- keeps the trigger future-proof: any column added to questions_v2
-- later gets included in the comparison automatically, without
-- touching this function.
--
-- Scope. Only questions_v2's trigger is swapped. The shared
-- set_updated_at() function keeps running unchanged on
-- practice_tests_v2 / practice_test_modules_v2 /
-- practice_test_module_items_v2 so their updated_at semantics are
-- unaffected.

create or replace function public.set_questions_v2_updated_at()
returns trigger
language plpgsql
as $$
declare
  new_content jsonb;
  old_content jsonb;
begin
  -- Strip the rendered-* columns and updated_at itself from both
  -- sides, then compare what's left. If anything else moved,
  -- it's a real edit and we bump updated_at; otherwise preserve
  -- the old value so the backfill doesn't masquerade as an edit.
  new_content := to_jsonb(new)
    - 'stem_rendered'
    - 'stimulus_rendered'
    - 'rationale_rendered'
    - 'options_rendered'
    - 'rendered_source_hash'
    - 'rendered_at'
    - 'updated_at';
  old_content := to_jsonb(old)
    - 'stem_rendered'
    - 'stimulus_rendered'
    - 'rationale_rendered'
    - 'options_rendered'
    - 'rendered_source_hash'
    - 'rendered_at'
    - 'updated_at';

  if new_content is distinct from old_content then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

-- Swap the trigger atomically. CREATE OR REPLACE TRIGGER is atomic
-- in Postgres 14+, so there's no window where the old generic
-- trigger fires against a questions_v2 update while this migration
-- is running.
create or replace trigger trg_questions_v2_updated_at
  before update on public.questions_v2
  for each row execute function public.set_questions_v2_updated_at();
