-- =========================================================
-- act_questions: soft delete + audit columns + difficulty provenance
-- =========================================================
-- ACT parity Phase 2 (question admin). Until now the only way to
-- change an approved ACT question was to unapprove its import
-- draft, which hard-deletes the row. The admin editor needs:
--
--   deleted_at        soft delete ("retire") — every student-facing
--                     reader filters `deleted_at is null` via
--                     lib/practice/act-visibility.ts, alongside the
--                     existing is_broken gate. Attempts, notes and
--                     error-log entries keep pointing at the row.
--   updated_at/by     who last edited the row and when.
--   difficulty_source where the difficulty value came from:
--                       'import'      — the importer's positional
--                                       formulas (Math, Science) or
--                                       a value carried by an older
--                                       manual import
--                       'ai_estimate' — model-rated (English/Reading
--                                       backfill, Phase 2 PR C)
--                       'manual'      — set by an admin in the editor
--                       'performance' — derived from student data
--                     Existing non-null difficulties are stamped
--                     'import'. Null difficulty ⇒ null source.
--
-- First step of the roadmap's "universal audit columns + soft
-- delete" item (docs/upgrade-plan-2026-07.md Phase 3 §4), applied to
-- this table only.

alter table public.act_questions
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users (id) on delete set null,
  add column if not exists difficulty_source text
    check (difficulty_source in ('import', 'ai_estimate', 'manual', 'performance'));

update public.act_questions
   set difficulty_source = 'import'
 where difficulty is not null
   and difficulty_source is null;

create index if not exists idx_act_questions_live
  on public.act_questions (section)
  where deleted_at is null and is_broken = false;

comment on column public.act_questions.deleted_at is
  'Soft delete. Student-facing readers filter deleted_at is null (lib/practice/act-visibility.ts). Set by the admin editor''s Retire action.';
comment on column public.act_questions.difficulty_source is
  'Provenance of difficulty: import | ai_estimate | manual | performance. Null when difficulty is null.';
