-- Phase 4 — pre-rendered math columns on questions_v2.
--
-- Background. questions_v2 stores stem_html / stimulus_html /
-- rationale_html / options[].content_html with math as a mix of
-- MathML (~35% of stems) and TeX delimiters (~12%). The legacy
-- tree renders math client-side with MathJax; the new tree is
-- moving to pre-rendered SVG so the client ships zero math
-- bundle. This migration adds the storage for those pre-rendered
-- forms. The actual rendering is done by scripts/render-math.mjs
-- which runs separately (manually for the backfill, via a
-- workflow_dispatch GitHub Action for subsequent passes).
--
-- Shape. Four parallel fields mirror the four HTML surfaces:
--   stem_rendered       text   — SVG-inlined copy of stem_html
--   stimulus_rendered   text   — SVG-inlined copy of stimulus_html
--   rationale_rendered  text   — SVG-inlined copy of rationale_html
--   options_rendered    jsonb  — array mirroring options, each
--                                element has content_html_rendered
--                                replacing content_html
--
-- Two bookkeeping columns let the script detect stale renders:
--   rendered_source_hash  text  — md5 over the concatenated source
--                                 HTML + options jsonb. If the
--                                 source changes, the hash moves
--                                 and the next script run picks
--                                 the row up for re-render.
--   rendered_at           timestamptz — when the render last ran.
--
-- Read path. The new-tree QuestionRenderer prefers *_rendered when
-- present and falls back to raw HTML otherwise, so rows that
-- haven't been rendered yet still display correctly (client-side
-- MathJax is not loaded in the new tree, so their math would render
-- as source text — acceptable transient state because the script
-- backfills all published rows before the column is wired up).
--
-- updated_at. questions_v2 has a generic trg_questions_v2_updated_at
-- trigger that bumps updated_at on every write. The render script
-- will therefore bump updated_at when it populates *_rendered.
-- That's acceptable: a materialized-render change is an observable
-- state change for cache-invalidation consumers. If it becomes
-- noisy we can make the trigger column-aware later.

alter table public.questions_v2
  add column if not exists stem_rendered        text,
  add column if not exists stimulus_rendered    text,
  add column if not exists rationale_rendered   text,
  add column if not exists options_rendered     jsonb,
  add column if not exists rendered_source_hash text,
  add column if not exists rendered_at          timestamptz;

-- Index to let the render script efficiently find work.
-- "Rows where the current source hash doesn't match the last
-- render" is the natural next-batch query. An index on
-- rendered_source_hash alone doesn't help (the comparison is
-- against a computed value), but an index on rendered_at lets
-- the script page through "never-rendered" rows cheaply, which
-- is the dominant case for the initial backfill.
create index if not exists idx_questions_v2_rendered_at
  on public.questions_v2 (rendered_at)
  where rendered_at is null;

-- PostgREST reload so /rest/v1/questions_v2 starts returning the
-- new columns on the next request instead of waiting for the
-- scheduled refresh.
notify pgrst, 'reload schema';
