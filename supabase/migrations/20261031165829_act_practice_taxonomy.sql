-- The ACT launcher needs counts, not one metadata row per question.
-- Keep the same visibility predicate as visibleActQuestions; caller RLS
-- on act_questions still applies before grouping.
create view public.act_practice_taxonomy
with (security_invoker = true)
as
select section, category, subcategory, count(*)::bigint as question_count
from public.act_questions
where is_broken = false and deleted_at is null
group by section, category, subcategory;

-- Override inherited/default grants: this is a signed-in, read-only API.
revoke all on public.act_practice_taxonomy from public, anon, authenticated, service_role;
grant select on public.act_practice_taxonomy to authenticated;

comment on view public.act_practice_taxonomy is
  'ACT practice filter counts for visible questions, subject to caller RLS.';
