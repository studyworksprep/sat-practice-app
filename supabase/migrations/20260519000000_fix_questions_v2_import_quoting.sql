-- Repair eight questions_v2 rows corrupted by a single importer run
-- on 2026-04-12 21:06. Two patterns came out of that run:
--
--   1. stimulus_html was written as the four-character text 'NULL'
--      instead of a SQL NULL — the importer dumped Python None
--      through str() before insert.
--   2. stem_html / stimulus_html / rationale_html were wrapped in
--      a leading and trailing '"' byte — the importer ran a
--      JSON-encoder over each cell but never escaped the inner
--      quotes, so we just strip the outer wrapper.
--
-- Affected display_codes (no others in the table match these
-- patterns at time of writing):
--   M-00748, M-00863, M-01212, M-01528, M-01692,
--   M-01708, M-01709, M-01734
--
-- Each UPDATE's WHERE clause checks the corrupted shape, so a
-- re-run after the fix is a no-op. rendered_at and
-- rendered_source_hash are cleared on every touched row so that
-- scripts/backfill-render-math.mjs picks them up and rebuilds the
-- *_rendered columns from the cleaned source.

-- Pattern 1: literal 'NULL' text → SQL NULL.
update public.questions_v2
set stimulus_html        = null,
    rendered_at          = null,
    rendered_source_hash = null
where stimulus_html = 'NULL';

-- Pattern 2a: stem_html wrapped in outer quote bytes.
update public.questions_v2
set stem_html            = substr(stem_html, 2, length(stem_html) - 2),
    rendered_at          = null,
    rendered_source_hash = null
where length(stem_html) >= 2
  and left(stem_html, 1) = '"'
  and right(stem_html, 1) = '"';

-- Pattern 2b: stimulus_html wrapped in outer quote bytes.
update public.questions_v2
set stimulus_html        = substr(stimulus_html, 2, length(stimulus_html) - 2),
    rendered_at          = null,
    rendered_source_hash = null
where length(stimulus_html) >= 2
  and left(stimulus_html, 1) = '"'
  and right(stimulus_html, 1) = '"';

-- Pattern 2c: rationale_html wrapped in outer quote bytes.
update public.questions_v2
set rationale_html       = substr(rationale_html, 2, length(rationale_html) - 2),
    rendered_at          = null,
    rendered_source_hash = null
where length(rationale_html) >= 2
  and left(rationale_html, 1) = '"'
  and right(rationale_html, 1) = '"';
