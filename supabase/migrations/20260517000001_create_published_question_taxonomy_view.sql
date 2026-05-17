-- public.published_question_taxonomy — DB-side rollup of the
-- question bank's taxonomy for the New Assignment form.
--
-- The form needs per-(domain, skill) score bands and counts plus a
-- global difficulty list. The loader previously paged through every
-- published, non-broken row of questions_v2 (~3,400 rows, four
-- 1000-row Supabase round-trips) and aggregated in JS. That was the
-- dominant cost in the 2–3 second New Assignment page load on a
-- 40-student roster.
--
-- This view collapses that work to ~30 rows (one per skill), so the
-- loader reads the whole taxonomy in a single round-trip and shapes
-- it client-side. security_invoker keeps RLS on the underlying
-- questions_v2 table; with the authenticated-can-read policy in
-- place, every signed-in user sees the same taxonomy.
--
-- Named published_question_taxonomy (not question_taxonomy) to avoid
-- collision with the existing v1 per-question tagging table.

create or replace view public.published_question_taxonomy
  with (security_invoker = on)
  as
select
  domain_name,
  skill_name,
  count(*)::int                                                          as question_count,
  array_agg(distinct score_band) filter (where score_band is not null)   as score_bands,
  array_agg(distinct difficulty) filter (where difficulty is not null)   as difficulties
from public.questions_v2
where is_published = true
  and is_broken    = false
  and domain_name is not null
  and skill_name  is not null
group by domain_name, skill_name;

grant select on public.published_question_taxonomy to authenticated;
