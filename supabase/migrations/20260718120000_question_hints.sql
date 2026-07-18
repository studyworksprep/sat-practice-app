-- =========================================================
-- Progressive hints — schema (upgrade plan §3.2)
-- =========================================================
-- questions_v2.hints: an ORDERED jsonb array of hint HTML strings,
-- weakest nudge first. The practice runner offers them one at a
-- time ("Need a nudge?") before reveal; the test runner never
-- selects the column (Bluebook parity, §6.2). Hint HTML follows the
-- same conventions as rationale_html (sanitized by
-- sanitizeQuestionHtml at render, inline LaTeX allowed).
--
-- question_content_drafts.hints: the drafts-pipeline shadow of the
-- same field — NULL means "this draft doesn't change hints", the
-- same no-change convention as the other draft columns. Promotion
-- copies a non-NULL value onto questions_v2.
--
-- Hint *usage* is recorded per attempt in attempts.response_json
-- ({"hints_used": n}) — the column has existed since v1 and has no
-- other writer. Mastery weighting of hint-assisted attempts is the
-- companion migration (20260718121000).

alter table public.questions_v2
  add column if not exists hints jsonb not null default '[]'::jsonb
  check (jsonb_typeof(hints) = 'array');

comment on column public.questions_v2.hints is
  'Ordered array of hint HTML strings (§3.2 progressive hints). '
  'Gentlest nudge first. Served to the practice runner only.';

alter table public.question_content_drafts
  add column if not exists hints jsonb
  check (hints is null or jsonb_typeof(hints) = 'array');

comment on column public.question_content_drafts.hints is
  'Draft hints array; NULL = no change to the live value (same '
  'convention as the other content columns).';
